/**
 * The generated historical feed.
 *
 * Cards are built by the extension because these videos did not come from the
 * native page. They can come from date-constrained Data API search or, when
 * that is unavailable, the related-video fallback. No view count is shown:
 * the API's current count would not be a historical count.
 *
 * The shelf never contains a video from outside the window; the walk filters
 * before returning, and the card links to the ordinary watch page, where the
 * watch guard applies as usual.
 */

import type { Translator } from "../core/i18n.js";
import type { CalendarDate, VideoId } from "../core/types.js";
import { FEED_CONTAINER_SELECTOR } from "./adapters.js";

const SHELF_CLASS = "time-slipper-discover";

export interface DiscoveredCard {
  videoId: VideoId;
  title: string | null;
  publishedDate: CalendarDate;
  channelTitle?: string;
}

export type DiscoveryState =
  | { status: "hidden" }
  | { status: "searching" }
  | { status: "results"; videos: DiscoveredCard[]; source: "api" | "related" }
  | { status: "empty" };

let shelf: HTMLElement | null = null;
let onRefresh: (() => void) | null = null;

export function setDiscoverRefreshHandler(handler: () => void): void {
  onRefresh = handler;
}

/**
 * Render the shelf to match the current state, creating or removing it as
 * needed. Idempotent: called on every scan.
 */
export function renderDiscovery(state: DiscoveryState, t: Translator): void {
  if (state.status === "hidden") {
    removeDiscovery();
    return;
  }

  const container = document.querySelector<HTMLElement>(FEED_CONTAINER_SELECTOR);
  if (!container) return;

  if (!shelf) shelf = createShelf(t);
  if (shelf.parentElement !== container) container.prepend(shelf);

  const title = shelf.querySelector(`.${SHELF_CLASS}__title`);
  const note = shelf.querySelector(`.${SHELF_CLASS}__note`);
  const grid = shelf.querySelector(`.${SHELF_CLASS}__grid`);
  const button = shelf.querySelector<HTMLButtonElement>(`.${SHELF_CLASS}__refresh`);

  if (title) title.textContent = t("discover.title");
  if (button) {
    button.textContent = t("discover.refresh");
    button.disabled = state.status === "searching";
  }

  if (note) {
    note.textContent =
      state.status === "searching"
        ? t("discover.searching")
        : state.status === "empty"
          ? t("discover.none")
          : state.status === "results" && state.source === "api"
            ? t("discover.subtitleApi")
            : t("discover.subtitle");
  }

  if (!grid) return;

  grid.textContent = "";
  if (state.status !== "results") return;

  for (const video of state.videos) {
    grid.appendChild(createCard(video, t));
  }
}

function createShelf(t: Translator): HTMLElement {
  const element = document.createElement("section");
  element.className = SHELF_CLASS;
  element.setAttribute("data-time-slipper-historical-feed", "");

  const header = document.createElement("div");
  header.className = `${SHELF_CLASS}__header`;

  const heading = document.createElement("h2");
  heading.className = `${SHELF_CLASS}__title`;

  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = `${SHELF_CLASS}__refresh`;
  refresh.textContent = t("discover.refresh");
  refresh.addEventListener("click", () => onRefresh?.());

  header.append(heading, refresh);

  const note = document.createElement("p");
  note.className = `${SHELF_CLASS}__note`;

  const grid = document.createElement("div");
  grid.className = `${SHELF_CLASS}__grid`;

  element.append(header, note, grid);
  return element;
}

function createCard(video: DiscoveredCard, t: Translator): HTMLElement {
  const link = document.createElement("a");
  link.className = `${SHELF_CLASS}__card`;
  link.href = `/watch?v=${video.videoId}`;

  const thumbnail = document.createElement("img");
  // Thumbnail URLs are derivable from the id, so no request is spent finding
  // them, and YouTube's own CSP already allows this host.
  thumbnail.src = `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`;
  thumbnail.className = `${SHELF_CLASS}__thumb`;
  thumbnail.loading = "lazy";
  thumbnail.alt = "";

  const title = document.createElement("span");
  title.className = `${SHELF_CLASS}__card-title`;
  title.textContent = video.title ?? video.videoId;

  const date = document.createElement("span");
  date.className = `${SHELF_CLASS}__card-date`;
  date.textContent = video.channelTitle
    ? `${video.channelTitle} · ${t.date(video.publishedDate)}`
    : t.date(video.publishedDate);

  link.append(thumbnail, title, date);
  return link;
}

export function removeDiscovery(): void {
  shelf?.remove();
  shelf = null;
}
