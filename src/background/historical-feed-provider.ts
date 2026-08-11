/**
 * Builds the extension-owned historical part of a feed.
 *
 * Date-constrained Data API search is authoritative when it is available. The
 * related-video graph is deliberately only a fallback for a missing key or a
 * failed API request; mixing both would make an API-backed feed unpredictable
 * and spend many watch-page requests after a successful search.
 */

import { compareCalendarDates } from "../core/date.js";
import type { CalendarDate, VideoId } from "../core/types.js";
import type { DiscoveredVideo, DiscoveryRequest } from "./discovery.js";
import type { EraSearchInput, EraSearchOutcome } from "./era-search.js";
import type { EraSearchOrder, EraSearchResult } from "./youtube-api.js";

export const HISTORICAL_SEARCH_PAGE_SIZE = 50;
export const MAX_HISTORICAL_API_PAGES = 4;

export type HistoricalFeedVideo = EraSearchResult["videos"][number];

export interface HistoricalFeedInput {
  apiKey: string;
  order: EraSearchOrder;
  start: CalendarDate | null;
  end: CalendarDate;
  needed: number;
  seeds: VideoId[];
  exclude: VideoId[];
  query?: string;
  channelId?: string;
  regionCode?: string;
  relevanceLanguage?: string;
}

export interface HistoricalFeedOutcome {
  videos: HistoricalFeedVideo[];
  source: "api" | "related" | "none";
  exhausted: boolean;
  errorKind?: string;
}

interface HistoricalFeedDependencies {
  eraSearch: { search(input: EraSearchInput): Promise<EraSearchOutcome> };
  discovery: { discover(input: DiscoveryRequest): Promise<DiscoveredVideo[]> };
  maxApiPages?: number;
}

export function createHistoricalFeedProvider(deps: HistoricalFeedDependencies) {
  const maxApiPages = deps.maxApiPages ?? MAX_HISTORICAL_API_PAGES;

  async function provide(input: HistoricalFeedInput): Promise<HistoricalFeedOutcome> {
    const needed = Math.max(0, Math.round(input.needed));
    if (needed === 0) return { videos: [], source: "none", exhausted: true };

    const excluded = new Set<VideoId>([...input.exclude, ...input.seeds]);
    const apiVideos: HistoricalFeedVideo[] = [];
    let pageToken: string | undefined;
    let apiWasAvailable = false;
    let apiErrorKind: string | undefined;

    for (let page = 0; page < maxApiPages && apiVideos.length < needed; page += 1) {
      const outcome = await deps.eraSearch.search({
        apiKey: input.apiKey,
        order: input.order,
        start: input.start,
        end: input.end,
        limit: HISTORICAL_SEARCH_PAGE_SIZE,
        exclude: [...excluded],
        ...(input.query ? { query: input.query } : {}),
        ...(input.channelId ? { channelId: input.channelId } : {}),
        ...(input.regionCode ? { regionCode: input.regionCode } : {}),
        ...(input.relevanceLanguage
          ? { relevanceLanguage: input.relevanceLanguage }
          : {}),
        ...(pageToken ? { pageToken } : {})
      });

      if (outcome.source === "unavailable") {
        apiErrorKind = outcome.errorKind;
        break;
      }

      apiWasAvailable = true;
      for (const video of outcome.videos) {
        if (excluded.has(video.videoId)) continue;
        if (!inWindow(video.publishedDate, input.start, input.end)) continue;
        excluded.add(video.videoId);
        apiVideos.push(video);
        if (apiVideos.length >= needed) break;
      }

      if (!outcome.nextPageToken) {
        pageToken = undefined;
        break;
      }
      pageToken = outcome.nextPageToken;
    }

    if (apiWasAvailable) {
      return {
        videos: apiVideos.slice(0, needed),
        source: "api",
        // The provider has exhausted either the API result set or this
        // request's bounded page budget. In both cases the content script must
        // not wait for a continuation that this request will never perform.
        exhausted: apiVideos.length < needed
      };
    }

    // A graph walk needs at least one in-window starting point. Home can still
    // be populated from the API with no survivors, but there is nowhere for a
    // related traversal to begin in that case.
    if (input.seeds.length === 0) {
      return {
        videos: [],
        source: "none",
        exhausted: true,
        ...(apiErrorKind ? { errorKind: apiErrorKind } : {})
      };
    }

    const walked = await deps.discovery.discover({
      seeds: input.seeds,
      start: input.start,
      end: input.end,
      limit: needed,
      exclude: [...excluded]
    });

    const videos: HistoricalFeedVideo[] = [];
    for (const video of walked) {
      if (excluded.has(video.videoId)) continue;
      if (!inWindow(video.publishedDate, input.start, input.end)) continue;
      excluded.add(video.videoId);
      videos.push({
        videoId: video.videoId,
        title: video.title ?? video.videoId,
        publishedDate: video.publishedDate
      });
    }

    return {
      videos: videos.slice(0, needed),
      source: videos.length > 0 ? "related" : "none",
      exhausted: videos.length < needed,
      ...(apiErrorKind ? { errorKind: apiErrorKind } : {})
    };
  }

  return { provide };
}

function inWindow(
  date: CalendarDate,
  start: CalendarDate | null,
  end: CalendarDate
): boolean {
  if (compareCalendarDates(date, end) > 0) return false;
  if (start && compareCalendarDates(date, start) < 0) return false;
  return true;
}
