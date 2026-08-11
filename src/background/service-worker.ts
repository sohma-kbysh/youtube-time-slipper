/**
 * The extension service worker.
 *
 * Its only job is to answer "when was this published?" for a batch of video
 * ids. It holds no policy: it does not know what the virtual date is and never
 * decides what to hide. That separation keeps the security-relevant part small
 * — the worker is the component with network access, so the less it is willing
 * to do on the page's behalf, the better.
 *
 * MV3 workers are stopped whenever they go idle, so nothing important lives in
 * module scope: the cache is on disk, and the in-flight map is a per-lifetime
 * optimisation that is simply empty after a restart.
 */

import { debug, warn } from "../core/log.js";
import {
  MAX_VIDEO_IDS_PER_REQUEST,
  MESSAGE_RESOLVE_ERROR,
  MESSAGE_VIDEO_DATES_RESOLVED,
  isResolveVideoDatesRequest,
  type ExtensionResponse
} from "../core/messages.js";
import type { PublicationResolution, VideoId } from "../core/types.js";
import { IndexedDbCache, MemoryCache, type PublicationCache } from "./cache.js";
import { FetchQueue } from "./fetch-queue.js";
import { createResolver } from "./resolver.js";

function createCache(): PublicationCache {
  try {
    return new IndexedDbCache();
  } catch (error) {
    // Private-mode and storage-partitioning edge cases: degrade to a cache
    // that dies with the worker rather than failing to resolve anything.
    warn("IndexedDB unavailable, falling back to in-memory cache", error);
    return new MemoryCache();
  }
}

const resolver = createResolver({
  cache: createCache(),
  queue: new FetchQueue()
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isResolveVideoDatesRequest(message)) return false;

  // Only YouTube tabs may ask. The manifest already restricts injection, but
  // the messaging channel is reachable from any extension page.
  const origin = sender.origin ?? sender.url ?? "";
  if (!origin.startsWith("https://www.youtube.com")) {
    sendResponse({
      type: MESSAGE_RESOLVE_ERROR,
      message: "unsupported origin"
    } satisfies ExtensionResponse);
    return false;
  }

  const videoIds = message.videoIds.slice(0, MAX_VIDEO_IDS_PER_REQUEST);

  resolver
    .resolveMany(videoIds)
    .then((resolutions) => {
      sendResponse({
        type: MESSAGE_VIDEO_DATES_RESOLVED,
        results: toRecord(resolutions)
      } satisfies ExtensionResponse);
    })
    .catch((error: unknown) => {
      warn("resolveMany failed", error);
      sendResponse({
        type: MESSAGE_RESOLVE_ERROR,
        message: String(error)
      } satisfies ExtensionResponse);
    });

  // Keeps the message channel open for the async reply above.
  return true;
});

function toRecord(
  resolutions: Map<VideoId, PublicationResolution>
): Record<VideoId, PublicationResolution> {
  const record: Record<VideoId, PublicationResolution> = {};
  for (const [videoId, resolution] of resolutions) {
    record[videoId] = resolution;
  }
  return record;
}

chrome.runtime.onInstalled.addListener(() => {
  debug("installed");
});
