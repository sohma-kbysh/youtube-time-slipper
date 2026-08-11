/**
 * The timeline indicator in YouTube's masthead.
 *
 * Without it the extension is indistinguishable from a broken or unusually
 * quiet YouTube: the user sees a thin home feed and no reason for it. The badge
 * makes the active virtual date visible at all times, which is also the fastest
 * way to notice you left the timeline switched on.
 */

import type { Translator } from "../core/i18n.js";
import type { Settings } from "../core/types.js";
import { findMastheadMount } from "./adapters.js";

const BADGE_CLASS = "time-slipper-badge";

let badge: HTMLElement | null = null;

function createBadge(): HTMLElement {
  const element = document.createElement("div");
  element.className = BADGE_CLASS;

  const dot = document.createElement("span");
  dot.className = `${BADGE_CLASS}__dot`;

  const label = document.createElement("span");
  label.className = `${BADGE_CLASS}__label`;

  element.append(dot, label);
  return element;
}

/**
 * Ensure the badge exists and is attached.
 *
 * Called on every scan because YouTube rebuilds its masthead across SPA
 * navigations, which silently detaches anything injected into it.
 */
export function mountBadge(settings: Settings, t: Translator): void {
  if (!settings.showTimelineBadge) {
    removeBadge();
    return;
  }

  if (!document.body) return;

  if (!badge) badge = createBadge();
  updateBadge(settings, t);

  if (badge.isConnected) return;

  const masthead = findMastheadMount();
  if (masthead) {
    badge.classList.remove(`${BADGE_CLASS}--floating`);
    masthead.prepend(badge);
  } else {
    // Shorts and some experiment layouts have no masthead; float it so the
    // indicator is never simply absent.
    badge.classList.add(`${BADGE_CLASS}--floating`);
    document.body.appendChild(badge);
  }
}

export function updateBadge(settings: Settings, t: Translator): void {
  if (!badge) return;

  const label = badge.querySelector(`.${BADGE_CLASS}__label`);
  // The date stays in ISO form here: it is a fixed-width, unambiguous token in
  // a small badge, where a localised long date would wrap or be truncated.
  const text = `TIME SLIPPER · ${settings.virtualDate}`;
  if (label && label.textContent !== text) label.textContent = text;

  const title = t("badge.tooltip", { date: t.date(settings.virtualDate) });
  if (badge.title !== title) badge.title = title;
}

export function removeBadge(): void {
  badge?.remove();
  badge = null;
}
