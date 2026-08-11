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
import type { BackfillStatus } from "./backfill.js";
import { mountFeedUi, setTextIfChanged, unmountFeedUi } from "./feed-ui.js";

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

  if (!panel) panel = createPanel(t);
  if (!mountFeedUi(panel)) return;

  const title = panel.querySelector(`.${PANEL_CLASS}__title`);
  const body = panel.querySelector(`.${PANEL_CLASS}__body`);
  const status = panel.querySelector(`.${PANEL_CLASS}__status`);
  const button = panel.querySelector<HTMLButtonElement>(`.${PANEL_CLASS}__button`);

  const date = t.date(model.virtualDate);
  const titleText = model.rateLimited
    ? t("feed.rateLimitedTitle")
    : model.status === "loading"
      ? t("feed.loading")
      : t("feed.sparseTitle");
  const bodyText = model.rateLimited
    ? t("feed.rateLimitedBody")
    : model.status === "exhausted"
      ? t("feed.exhausted")
      : t("feed.sparseBody", { date });
  const statusText = t("feed.visibleCount", {
    visible: model.visible,
    total: model.total
  });

  setTextIfChanged(title, titleText);
  setTextIfChanged(body, bodyText);
  setTextIfChanged(status, statusText);

  if (button) {
    setTextIfChanged(button, t("feed.loadMore"));
    const disabled = model.status === "loading" || model.rateLimited === true;
    if (button.disabled !== disabled) button.disabled = disabled;
    if (button.hidden !== disabled) button.hidden = disabled;
  }

  const state = model.rateLimited ? "rate-limited" : model.status;
  if (panel.dataset.state !== state) panel.dataset.state = state;
  const busy = model.status === "loading" && !model.rateLimited ? "true" : "false";
  if (panel.getAttribute("aria-busy") !== busy) panel.setAttribute("aria-busy", busy);
}

function createPanel(t: Translator): HTMLElement {
  const element = document.createElement("section");
  element.className = PANEL_CLASS;
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
  element.setAttribute("aria-labelledby", `${PANEL_CLASS}-title`);

  const title = document.createElement("h2");
  title.className = `${PANEL_CLASS}__title`;
  title.id = `${PANEL_CLASS}-title`;

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
  unmountFeedUi(panel);
  panel = null;
}
