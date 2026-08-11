/**
 * Turning a live YouTube page into a list of (card element, video id) pairs.
 *
 * The scanner is intentionally stateless: it reports what is on the page right
 * now, and the orchestrator in `index.ts` decides what is new. That split is
 * what makes it safe under SPA navigation, where YouTube recycles card
 * elements and swaps their contents rather than recreating them.
 */

import { debug } from "../core/log.js";
import type { Surface, VideoId } from "../core/types.js";
import {
  METADATA_TEXT_SELECTOR,
  VIDEO_LINK_SELECTOR,
  findCardContainer,
  surfaceForCard
} from "./adapters.js";
import { parseRelativeDate, type RelativeDateHint } from "./relative-date.js";
import { videoIdFromHref } from "./video-id.js";

export interface CardCandidate {
  /** The element that will be hidden or shown. */
  element: HTMLElement;
  videoId: VideoId;
  surface: Surface;
  /** Approximate age from the card's own metadata line. Ordering only. */
  hint: RelativeDateHint | null;
}

/** Cap on how much text is fed to the relative-date parser per card. */
const MAX_METADATA_TEXT = 200;

/**
 * Collect every video card under `root`.
 *
 * Cards are keyed by element, so a card whose thumbnail and title both link to
 * the same video yields one candidate. When one element somehow carries two
 * different video links, the first is used — a mismatch is reported on the next
 * scan anyway, because the orchestrator compares the tracked id against the
 * current one.
 */
export function collectCandidates(
  root: ParentNode,
  pageSurface: Surface,
  options: { readHints?: boolean } = {}
): CardCandidate[] {
  const readHints = options.readHints ?? true;
  const byElement = new Map<HTMLElement, CardCandidate>();

  const links = root.querySelectorAll<HTMLAnchorElement>(VIDEO_LINK_SELECTOR);

  for (const link of links) {
    const href = link.getAttribute("href");
    if (!href) continue;

    const videoId = videoIdFromHref(href);
    if (!videoId) continue;

    const element = findCardContainer(link);
    if (!element) {
      // A video link that is not inside any recognised card: a description
      // link, an end-screen element, a chapter jump. There is nothing
      // card-shaped to hide, and hiding an arbitrary ancestor would break the
      // page, so it is left alone.
      continue;
    }

    if (byElement.has(element)) continue;

    byElement.set(element, {
      element,
      videoId,
      surface: surfaceForCard(href, pageSurface),
      hint: readHints ? readHint(element) : null
    });
  }

  return [...byElement.values()];
}

function readHint(element: HTMLElement): RelativeDateHint | null {
  const metadata = element.querySelector(METADATA_TEXT_SELECTOR);
  const text = (metadata ?? element).textContent;
  if (!text) return null;

  return parseRelativeDate(text.slice(0, MAX_METADATA_TEXT));
}

/**
 * Order candidates so the ones most likely to be visible resolve first.
 *
 * Ordering only affects how quickly the page fills in; it never affects the
 * verdict. Ties keep DOM order, which is roughly reading order.
 */
export function prioritize(candidates: CardCandidate[]): CardCandidate[] {
  return [...candidates].sort((a, b) => {
    const ageA = a.hint?.approximateAgeDays ?? 0;
    const ageB = b.hint?.approximateAgeDays ?? 0;
    return ageB - ageA;
  });
}

export function logScan(candidates: CardCandidate[], resolvedCount: number): void {
  debug(
    `scan: ${candidates.length} cards, ${resolvedCount} already known, ` +
      `${candidates.length - resolvedCount} to resolve`
  );
}
