/**
 * The content script <-> service worker protocol.
 *
 * The content script runs in a page that YouTube (and anything YouTube embeds)
 * can influence, so the worker treats every message as untrusted input. In
 * particular the content script sends *video ids*, never URLs: the worker
 * builds the URL it fetches itself, so the extension cannot be turned into a
 * general-purpose fetch proxy for the page. See `background/resolver.ts`.
 */

import type { PublicationResolution, VideoId } from "./types.js";

export const MESSAGE_RESOLVE_VIDEO_DATES = "RESOLVE_VIDEO_DATES" as const;
export const MESSAGE_VIDEO_DATES_RESOLVED = "VIDEO_DATES_RESOLVED" as const;
export const MESSAGE_RESOLVE_ERROR = "RESOLVE_ERROR" as const;

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

export type ExtensionRequest = ResolveVideoDatesRequest;

export type ExtensionResponse = VideoDatesResolvedResponse | ResolveErrorResponse;

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
