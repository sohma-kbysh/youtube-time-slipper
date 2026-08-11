/**
 * The card state machine, expressed as DOM attributes.
 *
 * Hiding is done in CSS keyed off `data-time-slipper-state` rather than by
 * writing `style.display` from JavaScript, for three reasons: the stylesheet is
 * injected before the page's first paint so nothing flashes; YouTube's own code
 * frequently rewrites inline styles on its renderers and would undo us; and
 * disabling the extension is then a single attribute removal on <html> instead
 * of a walk over every card.
 *
 * Element identity is tracked in a WeakMap keyed by the element rather than by
 * marking it with a "processed" class. YouTube recycles card elements during
 * infinite scroll and SPA navigation — a card marked processed and then refilled
 * with a different video would keep the previous verdict, which is exactly how
 * a future video ends up on screen.
 */

import type { CardState, Settings, VideoId } from "../core/types.js";

export const STATE_ATTR = "data-time-slipper-state";
export const ROOT_ACTIVE_ATTR = "data-time-slipper";
export const ROOT_UNKNOWN_ATTR = "data-time-slipper-unknown";
export const ROOT_WATCH_ATTR = "data-time-slipper-watch";

interface TrackedCard {
  videoId: VideoId;
  state: CardState;
}

const tracked = new WeakMap<HTMLElement, TrackedCard>();

/** What we last recorded for this element, if anything. */
export function getTracked(element: HTMLElement): TrackedCard | undefined {
  return tracked.get(element);
}

/**
 * True when the element needs (re-)evaluating: either we have never seen it,
 * or it has been recycled to hold a different video.
 */
export function needsEvaluation(element: HTMLElement, videoId: VideoId): boolean {
  const previous = tracked.get(element);
  if (!previous) return true;
  if (previous.videoId !== videoId) return true;
  // A duplicate can become the primary when the earlier renderer is removed.
  return previous.state === "pending" || previous.state === "duplicate";
}

export function applyCardState(
  element: HTMLElement,
  videoId: VideoId,
  state: CardState
): void {
  const previous = tracked.get(element);

  if (previous && previous.videoId === videoId && previous.state === state) {
    return;
  }

  tracked.set(element, { videoId, state });
  element.setAttribute(STATE_ATTR, state);
}

/** Return a single card to YouTube's own control. */
export function resetCard(element: HTMLElement): void {
  tracked.delete(element);
  element.removeAttribute(STATE_ATTR);
}

/**
 * Return every card on the page to YouTube's own control.
 *
 * Used when the extension is switched off, when the active surface is
 * deselected, or when settings become invalid. It must leave no trace: an
 * extension that is "off" but still hiding things is worse than one that never
 * ran.
 */
export function resetAllCards(root: ParentNode = document): void {
  const marked = root.querySelectorAll<HTMLElement>(`[${STATE_ATTR}]`);
  for (const element of marked) {
    resetCard(element);
  }
}

/**
 * Publish the settings that CSS needs onto <html>.
 *
 * The unknown policy lives here so that flipping it in the popup re-reveals or
 * re-hides undated cards instantly, with no rescan and no reload.
 */
export function applyRootFlags(settings: Settings, active: boolean): void {
  const root = document.documentElement;
  if (!root) return;

  if (active) {
    root.setAttribute(ROOT_ACTIVE_ATTR, "on");
    root.setAttribute(ROOT_UNKNOWN_ATTR, settings.unknownPolicy);
  } else {
    root.removeAttribute(ROOT_ACTIVE_ATTR);
    root.removeAttribute(ROOT_UNKNOWN_ATTR);
  }
}

export function clearRootFlags(): void {
  const root = document.documentElement;
  if (!root) return;

  root.removeAttribute(ROOT_ACTIVE_ATTR);
  root.removeAttribute(ROOT_UNKNOWN_ATTR);
  root.removeAttribute(ROOT_WATCH_ATTR);
}

/** Counts for the debug log; cheap enough to compute per scan in dev builds. */
export function countStates(root: ParentNode = document): Record<CardState, number> {
  const counts: Record<CardState, number> = {
    pending: 0,
    visible: 0,
    future: 0,
    before: 0,
    unknown: 0,
    duplicate: 0
  };

  for (const element of root.querySelectorAll<HTMLElement>(`[${STATE_ATTR}]`)) {
    const state = element.getAttribute(STATE_ATTR) as CardState | null;
    if (state && state in counts) counts[state] += 1;
  }

  return counts;
}
