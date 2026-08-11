/**
 * YouTube Data API v3 client — bring your own key.
 *
 * This is the only way to ask YouTube a question the website itself cannot
 * answer: "what was published between these two dates, ordered by views?"
 * `search.list` takes `publishedAfter`/`publishedBefore` directly, so the
 * result is genuinely of the era rather than filtered down from today's
 * recommendations.
 *
 * The key belongs to the user, never to the extension. A shipped key would be
 * exhausted within minutes of the first few installs — the default quota is
 * 10,000 units a day and one search costs 100 — and it would bill one person
 * for everyone else's browsing. So the key is entered in the popup, stored in
 * that browser's local storage, and sent to exactly one host: googleapis.com.
 *
 * Everything here is quota-aware, because a user with 100 searches a day
 * deserves to know where they went.
 */

import { calendarDateFromIso, parseCalendarDate } from "../core/date.js";
import { debug } from "../core/log.js";
import type { CalendarDate, VideoId } from "../core/types.js";
import { isValidVideoId } from "../content/video-id.js";

const API_ORIGIN = "https://www.googleapis.com";

/** Quota cost per call, from the API's published table. */
export const QUOTA_SEARCH = 100;
export const QUOTA_VIDEOS_LIST = 1;

/** The default daily allowance of a fresh Google Cloud project. */
export const DAILY_QUOTA = 10_000;

const REQUEST_TIMEOUT_MS = 15_000;

/** A well-known video id, used only to check that a key works. */
const PROBE_VIDEO_ID = "dQw4w9WgXcQ";

export type EraSearchOrder = "viewCount" | "relevance" | "date" | "rating";

export interface EraSearchRequest {
  apiKey: string;
  /** Free-text query. Omitted for "whatever was big at the time". */
  query?: string;
  /** Restrict to one channel, for a channel page's back catalogue. */
  channelId?: string;
  /** Inclusive window. */
  after: CalendarDate | null;
  before: CalendarDate;
  order: EraSearchOrder;
  maxResults?: number;
  /** Opaque continuation returned by the previous search page. */
  pageToken?: string;
  /** Two-letter region and language hints, so results match the user. */
  regionCode?: string;
  relevanceLanguage?: string;
}

export interface EraSearchResult {
  videos: Array<{
    videoId: VideoId;
    title: string;
    publishedDate: CalendarDate;
    channelTitle?: string;
  }>;
  nextPageToken?: string;
  quotaUnits: number;
}

export interface ApiVideoMetadata {
  videoId: VideoId;
  publishedDate: CalendarDate;
  title: string;
  channelTitle: string;
}

export interface VideoMetadataResult {
  videos: Map<VideoId, ApiVideoMetadata>;
  quotaUnits: number;
}

/**
 * Why a call failed, in terms the UI can explain.
 *
 * These are distinguished because the fixes are completely different: a bad
 * key is a typo, `not-enabled` is a checkbox in the Cloud console, and
 * `quota` means come back tomorrow.
 */
export type ApiErrorKind =
  | "invalid-key"
  | "not-enabled"
  | "quota"
  | "forbidden"
  | "network"
  | "unexpected";

export class YouTubeApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;

  constructor(kind: ApiErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = "YouTubeApiError";
    this.kind = kind;
    this.status = status;
  }
}

export interface ApiDependencies {
  fetchImpl?: typeof fetch;
}

export function createYouTubeApi(deps: ApiDependencies = {}) {
  const doFetch = deps.fetchImpl ?? globalThis.fetch.bind(globalThis);

  async function call(
    path: string,
    params: Record<string, string>
  ): Promise<unknown> {
    const url = new URL(`${API_ORIGIN}/youtube/v3/${path}`);
    for (const [name, value] of Object.entries(params)) {
      if (value !== "") url.searchParams.set(name, value);
    }

    let response: Response;
    try {
      response = await doFetch(url.toString(), {
        method: "GET",
        // The key is the credential; the user's YouTube cookies have no
        // business being attached to it.
        credentials: "omit",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch (error) {
      throw new YouTubeApiError("network", String(error));
    }

    if (response.ok) {
      try {
        return await response.json();
      } catch (error) {
        throw new YouTubeApiError("unexpected", `malformed response: ${error}`);
      }
    }

    throw await describeFailure(response);
  }

  async function describeFailure(response: Response): Promise<YouTubeApiError> {
    let reason = "";
    let message = `HTTP ${response.status}`;

    try {
      const body = (await response.json()) as {
        error?: { message?: string; errors?: Array<{ reason?: string }> };
      };
      reason = body.error?.errors?.[0]?.reason ?? "";
      message = body.error?.message ?? message;
    } catch {
      // A non-JSON error body tells us nothing more than the status did.
    }

    if (response.status === 400) {
      return new YouTubeApiError("invalid-key", message, 400);
    }

    if (response.status === 403) {
      if (reason.includes("quota") || message.toLowerCase().includes("quota")) {
        return new YouTubeApiError("quota", message, 403);
      }
      if (reason === "accessNotConfigured") {
        return new YouTubeApiError("not-enabled", message, 403);
      }
      return new YouTubeApiError("forbidden", message, 403);
    }

    return new YouTubeApiError("unexpected", message, response.status);
  }

  /**
   * Check that a key works, as cheaply as the API allows.
   *
   * `videos.list` costs one unit against the user's 10,000, so verifying a key
   * is effectively free — unlike a search, which would spend 1% of the day's
   * budget just to say "yes, that key is fine".
   */
  async function verifyKey(apiKey: string): Promise<{ quotaUnits: number }> {
    if (!apiKey.trim()) {
      throw new YouTubeApiError("invalid-key", "no key provided");
    }

    await call("videos", {
      part: "id",
      id: PROBE_VIDEO_ID,
      key: apiKey.trim()
    });

    return { quotaUnits: QUOTA_VIDEOS_LIST };
  }

  /** Resolve up to fifty ordinary feed cards with one one-unit API call. */
  async function listVideoMetadata(
    apiKey: string,
    videoIds: VideoId[]
  ): Promise<VideoMetadataResult> {
    const ids = [...new Set(videoIds)].filter(isValidVideoId).slice(0, 50);
    const videos = new Map<VideoId, ApiVideoMetadata>();
    if (ids.length === 0) return { videos, quotaUnits: 0 };

    const body = (await call("videos", {
      part: "snippet",
      id: ids.join(","),
      key: apiKey.trim()
    })) as {
      items?: Array<{
        id?: string;
        snippet?: {
          publishedAt?: string;
          title?: string;
          channelTitle?: string;
        };
      }>;
    };

    for (const item of body.items ?? []) {
      const videoId = item.id;
      const publishedDate = calendarDateFromIso(item.snippet?.publishedAt);
      if (!videoId || !ids.includes(videoId) || !publishedDate) continue;

      videos.set(videoId, {
        videoId,
        publishedDate,
        title: decodeEntities(item.snippet?.title ?? videoId),
        channelTitle: decodeEntities(item.snippet?.channelTitle ?? "")
      });
    }

    return { videos, quotaUnits: QUOTA_VIDEOS_LIST };
  }

  /**
   * Search a date range.
   *
   * The API uses strict timestamp boundaries, so requests are expanded by one
   * millisecond/day edge to preserve our inclusive calendar-date window.
   */
  async function searchEra(request: EraSearchRequest): Promise<EraSearchResult> {
    const params: Record<string, string> = {
      part: "snippet",
      type: "video",
      maxResults: String(Math.min(Math.max(request.maxResults ?? 25, 1), 50)),
      order: request.order,
      // Both API parameters are strict inequalities. Use the start of the next
      // day so every instant on the selected final calendar day is included.
      publishedBefore: adjacentDayBoundary(request.before, 1),
      key: request.apiKey.trim()
    };

    // One millisecond before the first day turns the API's strict "after"
    // comparison into the inclusive calendar-date boundary used by policy.
    if (request.after) {
      params["publishedAfter"] = adjacentDayBoundary(request.after, 0, -1);
    }
    if (request.query) params["q"] = request.query.slice(0, 200);
    if (request.channelId) params["channelId"] = request.channelId;
    if (request.regionCode) params["regionCode"] = request.regionCode;
    if (request.relevanceLanguage) {
      params["relevanceLanguage"] = request.relevanceLanguage;
    }
    if (request.pageToken) params["pageToken"] = request.pageToken;

    const body = (await call("search", params)) as {
      nextPageToken?: string;
      items?: Array<{
        id?: { videoId?: string };
        snippet?: { title?: string; publishedAt?: string; channelTitle?: string };
      }>;
    };

    const videos: EraSearchResult["videos"] = [];

    for (const item of body.items ?? []) {
      const videoId = item.id?.videoId;
      const publishedDate = calendarDateFromIso(item.snippet?.publishedAt);

      // The API is the authority on its own dates, but the invariant is
      // checked here anyway: a result outside the window is not shown.
      if (!videoId || !isValidVideoId(videoId) || !publishedDate) continue;
      if (publishedDate > request.before) continue;
      if (request.after && publishedDate < request.after) continue;

      videos.push({
        videoId,
        title: decodeEntities(item.snippet?.title ?? videoId),
        publishedDate,
        ...(item.snippet?.channelTitle
          ? { channelTitle: decodeEntities(item.snippet.channelTitle) }
          : {})
      });
    }

    debug(`era search: ${videos.length} results for "${request.query ?? ""}"`);

    return {
      videos,
      ...(body.nextPageToken ? { nextPageToken: body.nextPageToken } : {}),
      quotaUnits: QUOTA_SEARCH
    };
  }

  return { verifyKey, listVideoMetadata, searchEra };
}

function adjacentDayBoundary(
  date: CalendarDate,
  dayOffset: number,
  millisecondOffset = 0
): string {
  const parsed = parseCalendarDate(date);
  if (!parsed) return `${date}T00:00:00Z`;

  return new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day + dayOffset) +
      millisecondOffset
  ).toISOString();
}

/** API titles arrive with HTML entities in them. */
function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * A cache key that never contains the API key.
 *
 * Cached responses live in ordinary storage; keeping the credential out of the
 * key means a cache dump cannot leak it.
 */
export function searchCacheKey(request: EraSearchRequest): string {
  return JSON.stringify([
    request.query ?? "",
    request.channelId ?? "",
    request.after ?? "",
    request.before,
    request.order,
    request.maxResults ?? 25,
    request.pageToken ?? "",
    request.regionCode ?? "",
    request.relevanceLanguage ?? ""
  ]);
}
