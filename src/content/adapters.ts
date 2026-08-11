/**
 * Everything that knows what YouTube's DOM looks like.
 *
 * This is the layer expected to rot. YouTube renames renderer elements and
 * migrates surfaces to new component families (`ytd-*` -> `yt-*-view-model`)
 * without notice, so all selectors are quarantined here: when the extension
 * stops filtering some shelf, this file is the only place that should need
 * editing. No policy decisions are made in this module.
 */

import type { Surface } from "../core/types.js";

/**
 * Link elements that address a video.
 *
 * Detection starts from links rather than from renderer names because a link
 * to `/watch` is the one thing every card shape has in common — a renderer we
 * have never heard of is still caught as long as it is clickable.
 */
export const VIDEO_LINK_SELECTOR = [
  'a[href^="/watch"]',
  'a[href^="/shorts/"]',
  'a[href^="/live/"]',
  'a[href^="https://www.youtube.com/watch"]',
  'a[href^="https://www.youtube.com/shorts/"]',
  'a[href^="https://youtu.be/"]'
].join(", ");

/**
 * Elements that represent one video card.
 *
 * Order is irrelevant; when several of these are nested we take the outermost
 * one (see `findCardContainer`) so that hiding a card removes its whole grid
 * cell instead of leaving a hole.
 */
export const CARD_CONTAINER_SELECTOR = [
  // Home / channel grids
  "ytd-rich-item-renderer",
  "ytd-rich-grid-media",
  "ytd-grid-video-renderer",
  // Search results and list surfaces
  "ytd-video-renderer",
  "ytd-radio-renderer",
  // Watch page sidebar
  "ytd-compact-video-renderer",
  "ytd-compact-radio-renderer",
  "yt-lockup-view-model",
  // Playlists
  "ytd-playlist-video-renderer",
  "ytd-playlist-panel-video-renderer",
  // Shorts
  "ytd-reel-item-renderer",
  "ytm-shorts-lockup-view-model",
  "ytm-shorts-lockup-view-model-v2"
].join(", ");

/**
 * Containers that hold *many* cards. Used as a stop condition so that a shelf
 * is never mistaken for a card and hidden wholesale.
 */
export const SHELF_SELECTOR = [
  "ytd-rich-shelf-renderer",
  "ytd-rich-section-renderer",
  "ytd-shelf-renderer",
  "ytd-reel-shelf-renderer",
  "ytd-item-section-renderer",
  "ytd-watch-next-secondary-results-renderer",
  "ytd-section-list-renderer"
].join(", ");

/** Elements carrying the card's metadata line ("3 years ago", "3 年前"). */
export const METADATA_TEXT_SELECTOR = [
  "#metadata-line",
  ".inline-metadata-item",
  "yt-content-metadata-view-model",
  "#video-info",
  "#byline-container"
].join(", ");

/**
 * Walk up from a video link to the element representing the whole card.
 *
 * Takes the *outermost* matching ancestor: `ytd-rich-grid-media` sits inside
 * `ytd-rich-item-renderer`, and hiding only the inner one leaves an empty cell
 * in the grid. The walk stops at a shelf, so a link that is not inside any
 * recognised card yields `null` rather than blanking an entire row.
 */
export function findCardContainer(link: Element): HTMLElement | null {
  let outermost: HTMLElement | null = null;
  let node: Element | null = link;

  while (node && node !== document.body) {
    if (node instanceof HTMLElement) {
      if (node.matches(CARD_CONTAINER_SELECTOR)) {
        outermost = node;
      } else if (node.matches(SHELF_SELECTOR)) {
        break;
      }
    }
    node = node.parentElement;
  }

  return outermost;
}

/** Which YouTube surface the current page is. */
export function detectPageSurface(location: Location | URL): Surface {
  const path = location.pathname;
  const search = new URLSearchParams(location.search);

  if (path === "/" || path === "" || path === "/index") return "home";
  if (path === "/results") return "search";
  if (path === "/watch") return "watchRelated";
  if (path.startsWith("/shorts/")) return "shorts";
  if (path === "/feed/subscriptions") return "subscriptions";
  if (path === "/playlist" || search.has("list")) return "playlists";
  if (path.startsWith("/feed/")) return "subscriptions";

  if (
    path.startsWith("/@") ||
    path.startsWith("/channel/") ||
    path.startsWith("/c/") ||
    path.startsWith("/user/")
  ) {
    return "channel";
  }

  return "other";
}

/**
 * The surface a specific card belongs to.
 *
 * A Shorts card is attributed to the Shorts surface wherever it appears, so
 * the Shorts toggle governs Shorts everywhere rather than only on
 * `/shorts/…`. Shorts are otherwise ordinary videos: they are filtered by
 * publication date like anything else, not hidden for being Shorts.
 */
export function surfaceForCard(href: string, pageSurface: Surface): Surface {
  if (href.includes("/shorts/")) return "shorts";
  return pageSurface;
}

/** Where the timeline badge is mounted, when the masthead exists. */
export function findMastheadMount(): HTMLElement | null {
  const masthead = document.querySelector("ytd-masthead #end, #masthead #end");
  return masthead instanceof HTMLElement ? masthead : null;
}

/**
 * Read the publication date of the *current* watch page out of its microformat
 * metadata. Free compared to a network round trip, so it is tried first for
 * the page the user is actually on.
 */
export function readDocumentPublicationMeta(doc: Document = document): string | null {
  const selectors = [
    'meta[itemprop="datePublished"]',
    'meta[itemprop="uploadDate"]',
    'meta[property="video:release_date"]'
  ];

  for (const selector of selectors) {
    const element = doc.querySelector(selector);
    const content = element?.getAttribute("content");
    if (content) return content;
  }

  return null;
}
