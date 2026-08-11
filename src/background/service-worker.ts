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
  MAX_DISCOVERY_LIMIT,
  MAX_VIDEO_IDS_PER_REQUEST,
  MESSAGE_ERA_DISCOVERED,
  MESSAGE_RESOLVE_ERROR,
  MESSAGE_VIDEO_DATES_RESOLVED,
  isDiscoverEraRequest,
  isResolveVideoDatesRequest,
  type ExtensionResponse
} from "../core/messages.js";
import type { PublicationResolution, VideoId } from "../core/types.js";
import { IndexedDbCache, MemoryCache, type PublicationCache } from "./cache.js";
import { createDiscovery } from "./discovery.js";
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

const discovery = createDiscovery({
  getWatchData: (videoId) => resolver.getWatchData(videoId)
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const isResolve = isResolveVideoDatesRequest(message);
  const isDiscover = isDiscoverEraRequest(message);
  if (!isResolve && !isDiscover) return false;

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

  const failed = (error: unknown): void => {
    warn("request failed", error);
    sendResponse({
      type: MESSAGE_RESOLVE_ERROR,
      message: String(error)
    } satisfies ExtensionResponse);
  };

  if (isResolve) {
    const videoIds = message.videoIds.slice(0, MAX_VIDEO_IDS_PER_REQUEST);

    resolver
      .resolveMany(videoIds)
      .then((resolutions) => {
        sendResponse({
          type: MESSAGE_VIDEO_DATES_RESOLVED,
          results: toRecord(resolutions)
        } satisfies ExtensionResponse);
      })
      .catch(failed);

    // Keeps the message channel open for the async reply above.
    return true;
  }

  discovery
    .discover({
      seeds: message.seeds.slice(0, MAX_VIDEO_IDS_PER_REQUEST),
      start: message.start,
      end: message.end,
      limit: Math.min(message.limit, MAX_DISCOVERY_LIMIT),
      exclude: message.exclude ?? []
    })
    .then((videos) => {
      sendResponse({
        type: MESSAGE_ERA_DISCOVERED,
        videos: videos.map(({ videoId, title, publishedDate }) => ({
          videoId,
          title,
          publishedDate
        }))
      } satisfies ExtensionResponse);
    })
    .catch(failed);

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
