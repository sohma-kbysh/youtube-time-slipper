/**
 * The panel shown when a feed comes out nearly empty.
 *
 * A blank page is the worst possible outcome: it is indistinguishable from the
 * extension being broken, and it gives the user nothing to act on. Saying "this
 * is what 2012 has to offer, here is why, here is how to get more" turns the
 * same page into a legible state.
 */

import type { Translator } from "../core/i18n.js";
import type { CalendarDate } from "../core/types.js";
import { FEED_CONTAINER_SELECTOR } from "./adapters.js";
import type { BackfillStatus } from "./backfill.js";

const PANEL_CLASS = "time-slipper-empty";

export interface EmptyStateModel {
  status: BackfillStatus;
  visible: number;
  total: number;
  virtualDate: CalendarDate;
  rateLimited?: boolean;
}

let panel: HTMLElement | null = null;
let onLoadMore: (() => void) | null = null;

/** Register the action behind the panel's button. */
export function setLoadMoreHandler(handler: () => void): void {
  onLoadMore = handler;
}

/**
 * Show, update or remove the panel to match the current state.
 *
 * Removed as soon as the feed has enough to show — the panel is a fallback,
 * not a permanent header.
 */
export function renderEmptyState(model: EmptyStateModel, t: Translator): void {
  if (model.status === "satisfied" || model.status === "idle") {
    removeEmptyState();
    return;
  }

  const container = document.querySelector<HTMLElement>(FEED_CONTAINER_SELECTOR);
  if (!container) return;

  if (!panel) panel = createPanel(t);

  if (panel.parentElement !== container) {
    container.prepend(panel);
  }

  const title = panel.querySelector(`.${PANEL_CLASS}__title`);
  const body = panel.querySelector(`.${PANEL_CLASS}__body`);
  const status = panel.querySelector(`.${PANEL_CLASS}__status`);
  const button = panel.querySelector<HTMLButtonElement>(`.${PANEL_CLASS}__button`);

  const date = t.date(model.virtualDate);

  if (title) {
    title.textContent = model.rateLimited
      ? t("feed.rateLimitedTitle")
      : t("feed.sparseTitle");
  }

  if (body) {
    body.textContent = model.rateLimited
      ? t("feed.rateLimitedBody")
      : model.status === "exhausted"
        ? t("feed.exhausted")
        : t("feed.sparseBody", { date });
  }

  if (status) {
    status.textContent =
      model.status === "loading" && !model.rateLimited
        ? t("feed.loading")
        : t("feed.visibleCount", { visible: model.visible, total: model.total });
  }

  if (button) {
    button.textContent = t("feed.loadMore");
    button.disabled = model.status === "loading" || model.rateLimited === true;
  }
}

function createPanel(t: Translator): HTMLElement {
  const element = document.createElement("div");
  element.className = PANEL_CLASS;

  const title = document.createElement("h2");
  title.className = `${PANEL_CLASS}__title`;

  const body = document.createElement("p");
  body.className = `${PANEL_CLASS}__body`;

  const status = document.createElement("p");
  status.className = `${PANEL_CLASS}__status`;

  const button = document.createElement("button");
  button.type = "button";
  button.className = `${PANEL_CLASS}__button`;
  button.textContent = t("feed.loadMore");
  button.addEventListener("click", () => onLoadMore?.());

  element.append(title, body, status, button);
  return element;
}

export function removeEmptyState(): void {
  panel?.remove();
  panel = null;
}
