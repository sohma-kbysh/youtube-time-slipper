/**
 * The content script <-> service worker protocol.
 *
 * The content script runs in a page that YouTube (and anything YouTube embeds)
 * can influence, so the worker treats every message as untrusted input. In
 * particular the content script sends *video ids*, never URLs: the worker
 * builds the URL it fetches itself, so the extension cannot be turned into a
 * general-purpose fetch proxy for the page. See `background/resolver.ts`.
 */

import type { CalendarDate, PublicationResolution, VideoId } from "./types.js";

export const MESSAGE_RESOLVE_VIDEO_DATES = "RESOLVE_VIDEO_DATES" as const;
export const MESSAGE_VIDEO_DATES_RESOLVED = "VIDEO_DATES_RESOLVED" as const;
export const MESSAGE_DISCOVER_ERA = "DISCOVER_ERA" as const;
export const MESSAGE_ERA_DISCOVERED = "ERA_DISCOVERED" as const;
export const MESSAGE_VERIFY_API_KEY = "VERIFY_API_KEY" as const;
export const MESSAGE_API_KEY_VERIFIED = "API_KEY_VERIFIED" as const;
export const MESSAGE_RESOLVE_ERROR = "RESOLVE_ERROR" as const;

/** Cap on historical feed cards requested at once. */
export const MAX_DISCOVERY_LIMIT = 200;

/** Upper bound on ids accepted in one request, to bound worker fan-out. */
export const MAX_VIDEO_IDS_PER_REQUEST = 200;

export interface ResolveVideoDatesRequest {
  type: typeof MESSAGE_RESOLVE_VIDEO_DATES;
  videoIds: VideoId[];
}

export interface VideoDatesResolvedResponse {
  type: typeof MESSAGE_VIDEO_DATES_RESOLVED;
  results: Record<VideoId, PublicationResolution>;
}

export interface ResolveErrorResponse {
  type: typeof MESSAGE_RESOLVE_ERROR;
  message: string;
}

export interface DiscoverEraRequest {
  type: typeof MESSAGE_DISCOVER_ERA;
  seeds: VideoId[];
  start: CalendarDate | null;
  end: CalendarDate;
  limit: number;
  exclude: VideoId[];
  /**
   * What the page is about, so an API search can be asked the right question:
   * the user's search terms, or the channel being viewed. Both optional — with
   * neither, the search is simply "what was big at the time".
   */
  query?: string;
  channelId?: string;
}

export interface VerifyApiKeyRequest {
  type: typeof MESSAGE_VERIFY_API_KEY;
  apiKey: string;
}

export interface ApiKeyVerifiedResponse {
  type: typeof MESSAGE_API_KEY_VERIFIED;
  ok: boolean;
  /** Machine-readable failure kind, for a translated message. */
  errorKind?: string;
  /** The API's own message, shown verbatim so a problem is diagnosable. */
  detail?: string;
}

export interface EraDiscoveredResponse {
  type: typeof MESSAGE_ERA_DISCOVERED;
  source: "api" | "related" | "none";
  exhausted: boolean;
  videos: Array<{
    videoId: VideoId;
    title: string | null;
    publishedDate: CalendarDate;
    channelTitle?: string;
  }>;
}

export type ExtensionRequest =
  | ResolveVideoDatesRequest
  | DiscoverEraRequest
  | VerifyApiKeyRequest;

export type ExtensionResponse =
  | VideoDatesResolvedResponse
  | EraDiscoveredResponse
  | ApiKeyVerifiedResponse
  | ResolveErrorResponse;

export function isVerifyApiKeyRequest(value: unknown): value is VerifyApiKeyRequest {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Partial<VerifyApiKeyRequest>;
  return (
    candidate.type === MESSAGE_VERIFY_API_KEY && typeof candidate.apiKey === "string"
  );
}

export function isApiKeyVerifiedResponse(
  value: unknown
): value is ApiKeyVerifiedResponse {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Partial<ApiKeyVerifiedResponse>;
  return candidate.type === MESSAGE_API_KEY_VERIFIED && typeof candidate.ok === "boolean";
}

export function isDiscoverEraRequest(value: unknown): value is DiscoverEraRequest {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Partial<DiscoverEraRequest>;
  if (candidate.type !== MESSAGE_DISCOVER_ERA) return false;
  if (!Array.isArray(candidate.seeds)) return false;
  if (typeof candidate.end !== "string") return false;

  return candidate.seeds.every((id) => typeof id === "string");
}

export function isEraDiscoveredResponse(
  value: unknown
): value is EraDiscoveredResponse {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Partial<EraDiscoveredResponse>;
  return (
    candidate.type === MESSAGE_ERA_DISCOVERED &&
    Array.isArray(candidate.videos) &&
    (candidate.source === "api" ||
      candidate.source === "related" ||
      candidate.source === "none") &&
    typeof candidate.exhausted === "boolean"
  );
}

export function isResolveVideoDatesRequest(
  value: unknown
): value is ResolveVideoDatesRequest {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Partial<ResolveVideoDatesRequest>;
  if (candidate.type !== MESSAGE_RESOLVE_VIDEO_DATES) return false;
  if (!Array.isArray(candidate.videoIds)) return false;

  return candidate.videoIds.every((id) => typeof id === "string");
}

export function isVideoDatesResolvedResponse(
  value: unknown
): value is VideoDatesResolvedResponse {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Partial<VideoDatesResolvedResponse>;
  return (
    candidate.type === MESSAGE_VIDEO_DATES_RESOLVED &&
    typeof candidate.results === "object" &&
    candidate.results !== null
  );
}
