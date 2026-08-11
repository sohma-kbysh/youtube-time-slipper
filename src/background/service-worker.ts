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
  MESSAGE_API_KEY_VERIFIED,
  MESSAGE_ERA_DISCOVERED,
  MESSAGE_RESOLVE_ERROR,
  MESSAGE_VIDEO_DATES_RESOLVED,
  isDiscoverEraRequest,
  isResolveVideoDatesRequest,
  isVerifyApiKeyRequest,
  type DiscoverEraRequest,
  type ExtensionResponse
} from "../core/messages.js";
import { loadSettings } from "../storage/settings.js";
import { recordUsage } from "../storage/api-usage.js";
import { createEraSearch } from "./era-search.js";
import { createYouTubeApi, YouTubeApiError } from "./youtube-api.js";
import type { PublicationResolution, VideoId } from "../core/types.js";
import { IndexedDbCache, MemoryCache, type PublicationCache } from "./cache.js";
import { createDiscovery } from "./discovery.js";
import { createHistoricalFeedProvider } from "./historical-feed-provider.js";
import { FetchQueue } from "./fetch-queue.js";
import {
  HTML_FETCH_CONCURRENCY,
  HTML_FETCH_MIN_INTERVAL_MS,
  createResolver
} from "./resolver.js";

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

const api = createYouTubeApi();

const resolver = createResolver({
  cache: createCache(),
  queue: new FetchQueue(HTML_FETCH_CONCURRENCY, HTML_FETCH_MIN_INTERVAL_MS),
  getApiKey: async () => {
    const settings = await loadSettings();
    if (!settings.apiKey) return null;

    try {
      const permitted = await chrome.permissions.contains({
        origins: ["https://www.googleapis.com/*"]
      });
      return permitted ? settings.apiKey : null;
    } catch {
      return null;
    }
  },
  listVideoMetadata: async (apiKey, videoIds) => {
    const result = await api.listVideoMetadata(apiKey, videoIds);
    await recordUsage(result.quotaUnits);
    return result.videos;
  }
});

const discovery = createDiscovery({
  getWatchData: (videoId) => resolver.getWatchData(videoId)
});

const eraSearch = createEraSearch();
const historicalFeed = createHistoricalFeedProvider({ eraSearch, discovery });

/**
 * Answer a historical-feed request.
 *
 * The API is tried first when the user has supplied a key: it can ask for a
 * date range directly, so the result is a real sample of the period rather
 * than an inference from today's recommendations. Everything else — no key, no
 * permission, quota gone, a network failure — falls through to the free
 * related-video walk when an in-window seed exists.
 */
async function discoverEra(message: DiscoverEraRequest) {
  const settings = await loadSettings();
  const limit = Math.min(message.limit, MAX_DISCOVERY_LIMIT);

  return historicalFeed.provide({
    apiKey: settings.apiKey,
    order: settings.apiOrder,
    start: message.start,
    end: message.end,
    needed: limit,
    seeds: message.seeds.slice(0, MAX_VIDEO_IDS_PER_REQUEST),
    exclude: message.exclude ?? [],
    ...(message.query ? { query: message.query } : {}),
    ...(message.channelId ? { channelId: message.channelId } : {})
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const isResolve = isResolveVideoDatesRequest(message);
  const isDiscover = isDiscoverEraRequest(message);
  const isVerify = isVerifyApiKeyRequest(message);
  if (!isResolve && !isDiscover && !isVerify) return false;

  // Only YouTube tabs may ask. The manifest already restricts injection, but
  // the messaging channel is reachable from any extension page.
  const origin = sender.origin ?? sender.url ?? "";
  // The popup is an extension page, and it is the only thing that verifies a
  // key; page content never sees the key at all.
  const allowed = isVerify
    ? origin.startsWith(`chrome-extension://${chrome.runtime.id}`)
    : origin.startsWith("https://www.youtube.com");

  if (!allowed) {
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
      .resolveManyDetailed(videoIds)
      .then(({ results, status }) => {
        sendResponse({
          type: MESSAGE_VIDEO_DATES_RESOLVED,
          results: toRecord(results),
          ...(status === "html-rate-limited"
            ? { resolverStatus: status }
            : {})
        } satisfies ExtensionResponse);
      })
      .catch(failed);

    // Keeps the message channel open for the async reply above.
    return true;
  }

  if (isVerify) {
    api
      .verifyKey(message.apiKey)
      .then(() => {
        sendResponse({
          type: MESSAGE_API_KEY_VERIFIED,
          ok: true
        } satisfies ExtensionResponse);
      })
      .catch((error: unknown) => {
        sendResponse({
          type: MESSAGE_API_KEY_VERIFIED,
          ok: false,
          errorKind: error instanceof YouTubeApiError ? error.kind : "unexpected",
          detail: error instanceof Error ? error.message : String(error)
        } satisfies ExtensionResponse);
      });

    return true;
  }

  discoverEra(message)
    .then((result) => {
      sendResponse({
        type: MESSAGE_ERA_DISCOVERED,
        ...result
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
