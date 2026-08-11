/**
 * Era discovery via the user's own API key, with the graph walk as a fallback.
 *
 * The Data API answers the question the website cannot: "what was published
 * between these dates, ordered by views?" That is a real sample of the period
 * rather than an inference from what YouTube recommends today, and it is
 * completely independent of the user's watch history.
 *
 * Everything here is built around the fact that the budget is the user's own.
 * A default project gets 10,000 units a day and a search costs 100, so:
 *
 *  - identical searches are served from a cached response for half a day,
 *  - the quota counter is updated on every call so the popup can show it,
 *  - and a missing key, a missing permission or an exhausted quota all fall
 *    back to the free related-video walk rather than failing.
 */

import { debug, warn } from "../core/log.js";
import type { CalendarDate, VideoId } from "../core/types.js";
import {
  readCachedSearch,
  recordUsage,
  writeCachedSearch
} from "../storage/api-usage.js";
import {
  createYouTubeApi,
  searchCacheKey,
  YouTubeApiError,
  type EraSearchOrder,
  type EraSearchResult
} from "./youtube-api.js";

const API_ORIGIN_PATTERN = "https://www.googleapis.com/*";

export interface EraSearchInput {
  apiKey: string;
  order: EraSearchOrder;
  start: CalendarDate | null;
  end: CalendarDate;
  limit: number;
  query?: string;
  channelId?: string;
  exclude?: VideoId[];
  regionCode?: string;
  relevanceLanguage?: string;
  pageToken?: string;
}

export interface EraSearchOutcome {
  videos: EraSearchResult["videos"];
  /** How the answer was obtained, for the debug log and tests. */
  source: "api" | "cache" | "unavailable";
  nextPageToken?: string;
  errorKind?: string;
}

export interface EraSearchDependencies {
  api?: ReturnType<typeof createYouTubeApi>;
  /** Whether the optional googleapis.com permission has been granted. */
  hasPermission?: () => Promise<boolean>;
}

export function createEraSearch(deps: EraSearchDependencies = {}) {
  const api = deps.api ?? createYouTubeApi();
  const hasPermission = deps.hasPermission ?? defaultHasPermission;

  async function search(input: EraSearchInput): Promise<EraSearchOutcome> {
    if (!input.apiKey) return { videos: [], source: "unavailable" };

    // The host permission is optional and requested from the popup. Calling
    // without it would fail as a network error and look like a broken key.
    if (!(await hasPermission())) {
      debug("era search skipped: googleapis.com permission not granted");
      return { videos: [], source: "unavailable", errorKind: "no-permission" };
    }

    const request = {
      apiKey: input.apiKey,
      after: input.start,
      before: input.end,
      order: input.order,
      maxResults: Math.min(Math.max(input.limit, 1), 50),
      ...(input.query ? { query: input.query } : {}),
      ...(input.channelId ? { channelId: input.channelId } : {}),
      ...(input.regionCode ? { regionCode: input.regionCode } : {}),
      ...(input.relevanceLanguage
        ? { relevanceLanguage: input.relevanceLanguage }
        : {}),
      ...(input.pageToken ? { pageToken: input.pageToken } : {})
    };

    const cacheKey = searchCacheKey(request);

    const cached = await readCachedSearch<EraSearchResult>(cacheKey);
    if (cached) {
      debug(`era search served from cache (${cached.videos.length} videos)`);
      return {
        videos: exclude(cached.videos, input.exclude),
        source: "cache",
        ...(cached.nextPageToken ? { nextPageToken: cached.nextPageToken } : {})
      };
    }

    try {
      const result = await api.searchEra(request);
      await recordUsage(result.quotaUnits);
      await writeCachedSearch(cacheKey, result);

      return {
        videos: exclude(result.videos, input.exclude),
        source: "api",
        ...(result.nextPageToken ? { nextPageToken: result.nextPageToken } : {})
      };
    } catch (error) {
      const kind = error instanceof YouTubeApiError ? error.kind : "unexpected";

      // A search that was rejected still consumed nothing, except when the
      // quota itself is the problem — in which case the counter is already
      // beyond the limit and the popup will say so.
      warn(`era search failed (${kind})`, error);
      return { videos: [], source: "unavailable", errorKind: kind };
    }
  }

  return { search };
}

function exclude(
  videos: EraSearchResult["videos"],
  excluded: VideoId[] | undefined
): EraSearchResult["videos"] {
  if (!excluded || excluded.length === 0) return videos;

  const skip = new Set(excluded);
  return videos.filter((video) => !skip.has(video.videoId));
}

async function defaultHasPermission(): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: [API_ORIGIN_PATTERN] });
  } catch {
    return false;
  }
}
