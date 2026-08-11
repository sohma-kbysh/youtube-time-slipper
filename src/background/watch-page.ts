/**
 * Reading a watch page for more than its date.
 *
 * The home feed is personalised and recency-biased, so filtering it returns
 * the same handful of videos the user already watches — the survivors of a
 * personalised feed are, by construction, familiar. Genuinely new-but-old
 * videos have to come from somewhere else.
 *
 * That somewhere else is YouTube's own related-video graph. Every watch page
 * carries a list of videos YouTube considers adjacent to it, and — because the
 * service worker fetches these pages without cookies — that list is *not*
 * personalised. Walking it from era-appropriate starting points is a way of
 * asking YouTube's recommender "what else is like this?" while staying inside
 * the timeline, rather than asking it "what should this person watch today?"
 * and throwing most of the answer away.
 *
 * The parsing here is deliberately shallow: ids and a title out of the
 * embedded JSON, no attempt to model YouTube's renderer schema. Anything it
 * cannot read simply yields fewer candidates.
 */

import { isValidVideoId } from "../content/video-id.js";
import type { VideoId } from "../core/types.js";

/** Cap on ids taken from one page, so a playlist page cannot flood the queue. */
const MAX_RELATED_PER_PAGE = 40;

/**
 * The region of the page holding related videos. Newer layouts renamed the
 * container, so several spellings are tried before falling back to the whole
 * document.
 */
const SECONDARY_MARKERS = [
  '"secondaryResults"',
  '"watchNextSecondaryResultsRenderer"',
  '"compactVideoRenderer"',
  '"lockupViewModel"'
];

const VIDEO_ID_IN_JSON = /"(?:videoId|contentId)"\s*:\s*"([A-Za-z0-9_-]{11})"/g;

const TITLE_PATTERNS: RegExp[] = [
  /<meta\s+name=["']title["']\s+content=["']([^"']+)["']/i,
  /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i,
  /"title"\s*:\s*\{\s*"simpleText"\s*:\s*"((?:[^"\\]|\\.)*)"/
];

export interface WatchPageContent {
  title: string | null;
  /** Videos YouTube considers adjacent to this one, in its own order. */
  related: VideoId[];
}

/**
 * Extract the title and the related-video ids from a watch page.
 *
 * `self` is excluded from the results, as are duplicates. The order YouTube
 * gave is preserved: it is the recommender's ranking, and it is the only
 * signal of relevance available here.
 */
export function parseWatchPageContent(
  html: string,
  self?: VideoId
): WatchPageContent {
  if (typeof html !== "string" || html.length === 0) {
    return { title: null, related: [] };
  }

  return {
    title: parseTitle(html),
    related: parseRelatedIds(html, self)
  };
}

export function parseTitle(html: string): string | null {
  for (const pattern of TITLE_PATTERNS) {
    const match = pattern.exec(html);
    const raw = match?.[1];
    if (raw) return decodeTitle(raw);
  }
  return null;
}

export function parseRelatedIds(html: string, self?: VideoId): VideoId[] {
  const region = relatedRegion(html);

  const seen = new Set<VideoId>();
  if (self) seen.add(self);

  const ids: VideoId[] = [];

  VIDEO_ID_IN_JSON.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = VIDEO_ID_IN_JSON.exec(region)) !== null) {
    const id = match[1] as VideoId;
    if (!isValidVideoId(id) || seen.has(id)) continue;

    seen.add(id);
    ids.push(id);

    if (ids.length >= MAX_RELATED_PER_PAGE) break;
  }

  return ids;
}

/**
 * Narrow the search to the part of the page listing related videos.
 *
 * Scanning the whole document would also pick up end-screen links, playlist
 * entries and assorted ids embedded in configuration. Those are not wrong
 * exactly — they are still adjacent to this video — but the secondary column
 * is the recommender's actual answer, so it is preferred when identifiable.
 */
function relatedRegion(html: string): string {
  for (const marker of SECONDARY_MARKERS) {
    const index = html.indexOf(marker);
    if (index !== -1) return html.slice(index);
  }
  return html;
}

/** Undo the JSON and HTML escaping that survives a raw regex extraction. */
function decodeTitle(raw: string): string {
  const unescaped = raw
    .replace(/\\u([\dA-Fa-f]{4})/g, (_match, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16))
    )
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  return unescaped.replace(/\s+/g, " ").trim().slice(0, 200);
}
