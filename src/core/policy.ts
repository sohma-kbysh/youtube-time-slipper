/**
 * The temporal access-control policy.
 *
 * This is the whole product in one pure function. It touches no DOM, no Chrome
 * API and no network, so the invariant can be tested exhaustively:
 *
 *     enabled  ∧  published(v) > virtualDate   ⇒  ¬available(v)
 *     enabled  ∧  published(v) = ⊥  ∧  strict  ⇒  ¬available(v)
 *
 * The boundary is inclusive: a video published *on* the virtual date is
 * visible.
 */

import { compareCalendarDates, isValidCalendarDate } from "./date.js";
import type {
  CalendarDate,
  CardState,
  ConfigurableSurface,
  Settings,
  Surface
} from "./types.js";

/**
 * Classify a video against the configured virtual present.
 *
 * `publishedDate` is `null` when resolution failed *or* has not happened yet;
 * both mean "we do not know this is in the past", which under the strict
 * default is not good enough to show it.
 *
 * An unparseable date is treated exactly like an unknown one rather than being
 * ignored — failing open here would defeat the point of the extension.
 */
export function classifyVideo(
  publishedDate: CalendarDate | null,
  settings: Pick<Settings, "virtualDate">
): Exclude<CardState, "pending"> {
  if (publishedDate === null) return "unknown";
  if (!isValidCalendarDate(publishedDate)) return "unknown";
  if (!isValidCalendarDate(settings.virtualDate)) {
    // A corrupt virtual date must not silently disable filtering.
    return "unknown";
  }

  return compareCalendarDates(publishedDate, settings.virtualDate) <= 0
    ? "visible"
    : "future";
}

/**
 * Whether a card in the given state should be hidden from the user.
 *
 * `pending` is hidden unconditionally. That is what prevents the
 * flash-of-future-content: a card is not painted until it has been positively
 * cleared, not merely "not yet found to be a problem".
 */
export function shouldHide(
  state: CardState,
  settings: Pick<Settings, "unknownPolicy">
): boolean {
  switch (state) {
    case "visible":
      return false;
    case "future":
      return true;
    case "pending":
      return true;
    case "unknown":
      return settings.unknownPolicy === "hide";
  }
}

/**
 * The final decision for a card, combining classification and the unknown
 * policy. `pending` is returned unchanged so the caller can distinguish
 * "not resolved yet" from "resolved and rejected" for diagnostics.
 */
export function decideCardState(
  publishedDate: CalendarDate | null | undefined,
  settings: Pick<Settings, "virtualDate">
): CardState {
  if (publishedDate === undefined) return "pending";
  return classifyVideo(publishedDate, settings);
}

/** Whether filtering applies to the surface a card was found on. */
export function isSurfaceEnabled(surface: Surface, settings: Settings): boolean {
  // Anything we could not attribute to a known surface is still filtered:
  // an unrecognised page is not a licence to show future videos.
  if (surface === "other") return true;
  return settings.surfaces[surface as ConfigurableSurface] !== false;
}

/**
 * Whether the extension should be doing anything at all on this page.
 */
export function isActive(settings: Settings): boolean {
  return settings.enabled && isValidCalendarDate(settings.virtualDate);
}
