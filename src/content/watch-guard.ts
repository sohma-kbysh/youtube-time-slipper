/**
 * The watch-page guard.
 *
 * Filtering feeds is not enough: a link from outside YouTube, a bookmark or a
 * pasted URL all reach `/watch?v=…` directly. Without this, the one interface
 * that actually plays the video would be the only one the timeline does not
 * cover.
 *
 * Honest limitation, also stated in the README: the guard runs at
 * `document_start`, which is after the navigation has been made. The extension
 * hides and silences the player as early as it can and blocks it as soon as the
 * date comes back, but it cannot promise that the browser fetched nothing about
 * a future video. What it guarantees is the user-facing half of the invariant —
 * a future video is never presented as something you can watch.
 */

import type { Translator } from "../core/i18n.js";
import type { CalendarDate } from "../core/types.js";
import { ROOT_WATCH_ATTR } from "./visibility.js";

export type WatchState = "idle" | "pending" | "allowed" | "blocked";

const OVERLAY_CLASS = "time-slipper-block";

let currentState: WatchState = "idle";
let suppressorInstalled = false;

export function getWatchState(): WatchState {
  return currentState;
}

/**
 * Move the guard into a new state.
 *
 * `pending` and `blocked` hide the player via CSS and stop playback; `allowed`
 * and `idle` remove every trace so the page behaves exactly as it would
 * without the extension.
 */
export function setWatchState(state: WatchState): void {
  currentState = state;

  const root = document.documentElement;
  if (!root) return;

  if (state === "pending" || state === "blocked") {
    root.setAttribute(ROOT_WATCH_ATTR, state);
    installPlaybackSuppressor();
    pauseAllMedia();
  } else {
    root.removeAttribute(ROOT_WATCH_ATTR);
  }

  if (state !== "blocked") {
    removeBlockOverlay();
  }
}

/**
 * Show the "this video does not exist yet" panel.
 *
 * `publishedDate` may be null when the video is blocked under the strict
 * unknown policy; the panel then says so rather than inventing a date.
 */
export function showBlockOverlay(options: {
  virtualDate: CalendarDate;
  rangeStart?: CalendarDate | null;
  publishedDate: CalendarDate | null;
  t: Translator;
}): void {
  const t = options.t;
  setWatchState("blocked");

  whenBodyReady(() => {
    removeBlockOverlay();

    const overlay = document.createElement("div");
    overlay.className = OVERLAY_CLASS;

    const panel = document.createElement("div");
    panel.className = `${OVERLAY_CLASS}__panel`;

    const start = options.rangeStart ?? null;
    const isBeforeWindow =
      start !== null &&
      options.publishedDate !== null &&
      options.publishedDate < start;

    const title = document.createElement("h1");
    title.className = `${OVERLAY_CLASS}__title`;
    title.textContent =
      options.publishedDate === null
        ? t("block.titleUnknown")
        : isBeforeWindow
          ? t("block.titleBefore")
          : t("block.titleFuture");
    panel.appendChild(title);

    const rows = document.createElement("dl");
    rows.className = `${OVERLAY_CLASS}__rows`;

    if (start === null) {
      appendRow(rows, t("block.virtualPresent"), t.date(options.virtualDate));
    } else {
      // With a period set, "virtual present" alone would not explain why a
      // video from 2009 was blocked.
      appendRow(
        rows,
        t("block.window"),
        `${t.date(start)} – ${t.date(options.virtualDate)}`
      );
    }
    appendRow(
      rows,
      t("block.published"),
      options.publishedDate === null
        ? t("block.unknown")
        : t.date(options.publishedDate)
    );
    panel.appendChild(rows);

    const button = document.createElement("button");
    button.type = "button";
    button.className = `${OVERLAY_CLASS}__button`;
    button.textContent = t("block.goBack");
    button.addEventListener("click", goBack);
    panel.appendChild(button);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  });
}

/**
 * Whether the block panel is currently in the document.
 *
 * YouTube's SPA replaces large parts of the page on navigation and can take
 * the overlay with it. The player stays hidden by CSS either way, so the
 * invariant holds regardless, but a blocked page with no explanation on it
 * just looks broken.
 */
export function isBlockOverlayPresent(): boolean {
  return document.querySelector(`.${OVERLAY_CLASS}`) !== null;
}

export function removeBlockOverlay(): void {
  for (const node of document.querySelectorAll(`.${OVERLAY_CLASS}`)) {
    node.remove();
  }
}

function appendRow(list: HTMLElement, label: string, value: string): void {
  const dt = document.createElement("dt");
  dt.className = `${OVERLAY_CLASS}__label`;
  dt.textContent = label;

  const dd = document.createElement("dd");
  dd.className = `${OVERLAY_CLASS}__value`;
  dd.textContent = value;

  list.append(dt, dd);
}

function goBack(): void {
  // `history.length > 1` is not a reliable "there is somewhere to go back to"
  // on a SPA, but going home is a safe landing either way.
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = "https://www.youtube.com/";
  }
}

/**
 * Stop playback whenever the guard is not in `allowed`.
 *
 * Hiding the player visually is not enough — audio would keep playing, and the
 * player element is recreated by YouTube on every SPA navigation, so a one-shot
 * pause would be undone. A capturing listener on `document` catches the media
 * element however and whenever it appears.
 */
function installPlaybackSuppressor(): void {
  if (suppressorInstalled) return;
  suppressorInstalled = true;

  const suppress = (event: Event): void => {
    if (currentState !== "pending" && currentState !== "blocked") return;

    const target = event.target;
    if (target instanceof HTMLMediaElement) {
      pauseSafely(target);
    }
  };

  document.addEventListener("play", suppress, true);
  document.addEventListener("playing", suppress, true);
}

function pauseAllMedia(): void {
  for (const media of document.querySelectorAll("video, audio")) {
    if (media instanceof HTMLMediaElement) pauseSafely(media);
  }
}

/**
 * One media element refusing to pause must not stop us hiding the rest of the
 * page — the visual block is the part the user sees.
 */
function pauseSafely(media: HTMLMediaElement): void {
  try {
    media.pause();
  } catch {
    // Ignored on purpose: nothing useful to do, and the guard continues.
  }
}

function whenBodyReady(action: () => void): void {
  if (document.body) {
    action();
    return;
  }

  // At document_start there is no body yet.
  document.addEventListener("DOMContentLoaded", action, { once: true });
}
