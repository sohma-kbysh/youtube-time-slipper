/**
 * Video identity.
 *
 * The video id is the only thing that crosses the boundary between the page
 * and the service worker, and it is the key under which publication dates are
 * cached. Everything downstream assumes it has been through `isValidVideoId`.
 *
 * This module lives under `content/` because that is where ids are produced,
 * but it is deliberately DOM-free and pure so the worker can reuse the
 * validator on the receiving end.
 */

import type { VideoId } from "../core/types.js";

/** YouTube ids are 11 characters of URL-safe base64. */
export const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_ORIGIN = "https://www.youtube.com";

/** Path prefixes that address a single video by id. */
const ID_IN_PATH_PREFIXES = ["/shorts/", "/embed/", "/live/", "/v/"];

export function isValidVideoId(value: unknown): value is VideoId {
  return typeof value === "string" && VIDEO_ID_PATTERN.test(value);
}

/**
 * Extract the canonical video id from a link href or a full URL.
 *
 * Handles the forms YouTube actually emits:
 *
 *   /watch?v=dQw4w9WgXcQ
 *   /watch?v=dQw4w9WgXcQ&t=10&list=…
 *   /shorts/dQw4w9WgXcQ
 *   /embed/dQw4w9WgXcQ?autoplay=1
 *   /live/dQw4w9WgXcQ
 *   https://www.youtube.com/watch?v=…
 *   https://youtu.be/dQw4w9WgXcQ
 *
 * Returns `null` for anything else — including `/watch?list=…` playlist links
 * with no video, and hrefs whose id is not well-formed. A `null` here means
 * "no video to check", not "safe to show": callers must not create a card for
 * an href they could not identify.
 */
export function videoIdFromHref(href: unknown): VideoId | null {
  if (typeof href !== "string" || href.length === 0) return null;

  let url: URL;
  try {
    url = new URL(href, YOUTUBE_ORIGIN);
  } catch {
    return null;
  }

  if (url.hostname === "youtu.be") {
    return idFromPathSegment(url.pathname.slice(1));
  }

  if (!isYouTubeHost(url.hostname)) return null;

  if (url.pathname === "/watch" || url.pathname === "/watch/") {
    return idFromPathSegment(url.searchParams.get("v"));
  }

  for (const prefix of ID_IN_PATH_PREFIXES) {
    if (url.pathname.startsWith(prefix)) {
      return idFromPathSegment(url.pathname.slice(prefix.length));
    }
  }

  return null;
}

function isYouTubeHost(hostname: string): boolean {
  return (
    hostname === "www.youtube.com" ||
    hostname === "youtube.com" ||
    hostname === "m.youtube.com" ||
    hostname === "music.youtube.com" ||
    hostname === "www.youtube-nocookie.com"
  );
}

/** Take the first path segment and validate it as an id. */
function idFromPathSegment(raw: string | null): VideoId | null {
  if (raw === null) return null;

  const segment = raw.split("/")[0]?.split("?")[0]?.split("#")[0] ?? "";
  return isValidVideoId(segment) ? segment : null;
}

/** True when the URL addresses a watchable video page (not a feed). */
export function isWatchUrl(href: string): boolean {
  return videoIdFromHref(href) !== null;
}

/** The video the given location is currently playing, if any. */
export function currentWatchVideoId(location: Location | URL): VideoId | null {
  return videoIdFromHref(location.href);
}
