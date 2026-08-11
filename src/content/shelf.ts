/**
 * Collapsing shelves that filtering has emptied.
 *
 * Hiding cards one by one leaves the scaffolding behind: a "Breaking news"
 * heading with nothing under it, a "Show less" button for an empty row, bands
 * of blank space. The page reads as broken rather than as a different point in
 * time. A shelf whose every video is hidden should not be on the page at all.
 *
 * A shelf that contains no video cards (a news shelf of articles, a post) is
 * left alone: it was never ours to hide.
 */

import type { Settings } from "../core/types.js";
import { SHELF_SELECTOR } from "./adapters.js";
import { STATE_ATTR } from "./visibility.js";

export const SHELF_ATTR = "data-time-slipper-shelf";

/**
 * True when a card in this state is not visible to the user.
 *
 * Mirrors the CSS in content.css. The two must agree: this decides whether a
 * shelf looks empty, and the stylesheet decides whether it actually is.
 */
export function isHiddenState(
  state: string | null,
  settings: Pick<Settings, "unknownPolicy">
): boolean {
  if (state === "future" || state === "pending") return true;
  if (state === "unknown") return settings.unknownPolicy === "hide";
  return false;
}

/**
 * Hide every shelf whose videos are all hidden, and reveal the ones that have
 * regained a visible video (the virtual date moved, or a resolution landed).
 */
export function collapseEmptyShelves(
  settings: Pick<Settings, "unknownPolicy">,
  root: ParentNode = document
): { collapsed: number } {
  let collapsed = 0;

  for (const shelf of root.querySelectorAll<HTMLElement>(SHELF_SELECTOR)) {
    const cards = shelf.querySelectorAll<HTMLElement>(`[${STATE_ATTR}]`);

    if (cards.length === 0) {
      // Nothing of ours in here; it is not an emptied shelf, just not a video
      // shelf. Undo any earlier verdict in case its cards were removed.
      shelf.removeAttribute(SHELF_ATTR);
      continue;
    }

    let hasVisible = false;
    for (const card of cards) {
      if (!isHiddenState(card.getAttribute(STATE_ATTR), settings)) {
        hasVisible = true;
        break;
      }
    }

    if (hasVisible) {
      shelf.removeAttribute(SHELF_ATTR);
    } else {
      shelf.setAttribute(SHELF_ATTR, "empty");
      collapsed += 1;
    }
  }

  return { collapsed };
}

/** Remove every shelf verdict, for when the extension is switched off. */
export function resetShelves(root: ParentNode = document): void {
  for (const shelf of root.querySelectorAll<HTMLElement>(`[${SHELF_ATTR}]`)) {
    shelf.removeAttribute(SHELF_ATTR);
  }
}

/** How many cards on the page are currently visible to the user. */
export function countVisibleCards(
  settings: Pick<Settings, "unknownPolicy">,
  root: ParentNode = document
): { visible: number; total: number } {
  const cards = root.querySelectorAll<HTMLElement>(`[${STATE_ATTR}]`);

  let visible = 0;
  for (const card of cards) {
    if (!isHiddenState(card.getAttribute(STATE_ATTR), settings)) visible += 1;
  }

  return { visible, total: cards.length };
}
