/**
 * Content-script orchestrator.
 *
 * Owns the loop: observe the page, ask the worker for dates it does not have,
 * and apply the policy to every card. Everything it does is reversible — when
 * the extension is switched off it removes every attribute and node it added,
 * and YouTube is left exactly as it was.
 */

import { calendarDateFromIso } from "../core/date.js";
import { debug } from "../core/log.js";
import {
  MAX_VIDEO_IDS_PER_REQUEST,
  MESSAGE_RESOLVE_VIDEO_DATES,
  isVideoDatesResolvedResponse
} from "../core/messages.js";
import { decideCardState, isActive, isSurfaceEnabled } from "../core/policy.js";
import type { CalendarDate, Settings, VideoId } from "../core/types.js";
import { defaultSettings, loadSettings, onSettingsChanged } from "../storage/settings.js";
import { detectPageSurface, readDocumentPublicationMeta } from "./adapters.js";
import { mountBadge, removeBadge, updateBadge } from "./badge.js";
import { collectCandidates, prioritize, type CardCandidate } from "./scanner.js";
import { currentWatchVideoId } from "./video-id.js";
import {
  applyCardState,
  applyRootFlags,
  clearRootFlags,
  countStates,
  resetAllCards,
  resetCard
} from "./visibility.js";
import {
  isBlockOverlayPresent,
  removeBlockOverlay,
  setWatchState,
  showBlockOverlay
} from "./watch-guard.js";

const SCAN_DEBOUNCE_MS = 100;

/** Back off this long after repeated messaging failures. */
const RESOLUTION_BACKOFF_MS = 30_000;
const MAX_CONSECUTIVE_FAILURES = 3;

let settings: Settings = { ...defaultSettings(), enabled: false };
let settingsLoaded = false;

/**
 * Dates we already know, for this page's lifetime.
 *
 * `null` means resolved-and-unknown; a missing key means not asked yet. The
 * distinction matters: the first is a verdict, the second is a pending card.
 */
const resolutions = new Map<VideoId, CalendarDate | null>();
const requested = new Set<VideoId>();

let scanTimer: number | null = null;
let lastHref = "";
let consecutiveFailures = 0;
let backoffUntil = 0;

/** The video the watch guard has already ruled on, so it is not re-run. */
let guardedVideoId: VideoId | null = null;

/** The video currently being blocked, if any. */
let blockedVideoId: VideoId | null = null;

let observer: MutationObserver | null = null;
let unsubscribeSettings: (() => void) | null = null;
const documentListeners: Array<[EventTarget, string, EventListener]> = [];

// --------------------------------------------------------------------- boot

/**
 * Runs before the page has painted, and before settings have loaded.
 *
 * If this is a watch URL we hide the player immediately and ask questions
 * afterwards. Waiting for the settings round trip first would mean a future
 * video is visible and audible for as long as storage takes to answer. The cost
 * is that a user with the extension disabled may see the player suppressed for
 * those few milliseconds; `applySettings` releases it as soon as it knows.
 */
function preGuard(): void {
  if (currentWatchVideoId(window.location)) {
    setWatchState("pending");
  }
}

/**
 * Start filtering this page. Resolves once the first pass has been applied,
 * and returns a function that removes every observer, listener and DOM change
 * the extension made.
 *
 * Production calls this once, at the bottom of the module. It is separated
 * from module evaluation so that tests can run a real instance and then stop
 * it, rather than leaving one attached to the document forever.
 */
export async function start(): Promise<() => void> {
  preGuard();

  settings = await loadSettings();
  settingsLoaded = true;

  unsubscribeSettings = onSettingsChanged((next) => {
    settings = next;
    applySettings({ rescan: true });
  });

  observe();
  applySettings({ rescan: true });

  return stop;
}

export function stop(): void {
  observer?.disconnect();
  observer = null;

  for (const [target, type, listener] of documentListeners.splice(0)) {
    target.removeEventListener(type, listener);
  }

  unsubscribeSettings?.();
  unsubscribeSettings = null;

  if (scanTimer !== null) {
    clearTimeout(scanTimer);
    scanTimer = null;
  }

  settingsLoaded = false;
  resolutions.clear();
  requested.clear();
  lastHref = "";

  teardown();
}

// ----------------------------------------------------------------- lifecycle

function applySettings(options: { rescan: boolean }): void {
  const active = isActive(settings);
  applyRootFlags(settings, active);

  if (!active) {
    teardown();
    return;
  }

  updateBadge(settings);

  // Dates are immutable, so a changed virtual date needs no re-resolution —
  // only re-classification of what we already know.
  guardedVideoId = null;
  if (options.rescan) scheduleScan(true);
}

function teardown(): void {
  resetAllCards();
  clearRootFlags();
  removeBlockOverlay();
  setWatchState("idle");
  removeBadge();
  guardedVideoId = null;
  blockedVideoId = null;
}

function observe(): void {
  observer?.disconnect();
  observer = new MutationObserver(() => scheduleScan(false));

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    // Only `href`: card elements are recycled by rewriting their links, and
    // filtering this narrowly also stops our own state attribute from
    // re-triggering the observer.
    attributeFilter: ["href"]
  });

  // YouTube's own navigation event. The observer would catch the resulting DOM
  // churn anyway, but this fires earlier and makes SPA navigation feel instant.
  listen(document, "yt-navigate-finish");
  listen(window, "popstate");
  listen(window, "pageshow");
}

function listen(target: EventTarget, type: string): void {
  const listener: EventListener = () => scheduleScan(true);
  target.addEventListener(type, listener);
  documentListeners.push([target, type, listener]);
}

function scheduleScan(immediate: boolean): void {
  if (!settingsLoaded) return;

  if (immediate) {
    if (scanTimer !== null) {
      clearTimeout(scanTimer);
      scanTimer = null;
    }
    runScan();
    return;
  }

  if (scanTimer !== null) return;
  scanTimer = window.setTimeout(() => {
    scanTimer = null;
    runScan();
  }, SCAN_DEBOUNCE_MS);
}

function runScan(): void {
  if (!isActive(settings)) return;

  detectNavigation();
  evaluateWatchPage();
  evaluateCards();
  mountBadge(settings);
}

/**
 * SPA navigation leaves the document in place, so the guard state has to be
 * reconsidered whenever the URL changes under us.
 */
function detectNavigation(): void {
  const href = window.location.href;
  if (href === lastHref) return;

  lastHref = href;
  guardedVideoId = null;
  blockedVideoId = null;

  const videoId = currentWatchVideoId(window.location);
  if (videoId) {
    setWatchState("pending");
  } else {
    setWatchState("idle");
  }
}

// --------------------------------------------------------------------- cards

function evaluateCards(): void {
  const pageSurface = detectPageSurface(window.location);
  const candidates = collectCandidates(document, pageSurface);

  const pending: CardCandidate[] = [];

  for (const candidate of candidates) {
    if (!isSurfaceEnabled(candidate.surface, settings)) {
      // The user has opted this surface out; hand the card back to YouTube.
      resetCard(candidate.element);
      continue;
    }

    const known = resolutions.has(candidate.videoId)
      ? resolutions.get(candidate.videoId) ?? null
      : undefined;

    const state = decideCardState(known, settings);
    applyCardState(candidate.element, candidate.videoId, state);

    if (state === "pending" && !requested.has(candidate.videoId)) {
      pending.push(candidate);
    }
  }

  if (pending.length > 0) {
    void requestResolutions(prioritize(pending).map((card) => card.videoId));
  }

  if (candidates.length > 0) {
    const counts = countStates();
    debug(
      `cards=${candidates.length} visible=${counts.visible} future=${counts.future} ` +
        `unknown=${counts.unknown} pending=${counts.pending}`
    );
  }
}

async function requestResolutions(videoIds: VideoId[]): Promise<void> {
  if (Date.now() < backoffUntil) return;

  const batch = videoIds.slice(0, MAX_VIDEO_IDS_PER_REQUEST);
  for (const videoId of batch) requested.add(videoId);

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_RESOLVE_VIDEO_DATES,
      videoIds: batch
    });

    if (!isVideoDatesResolvedResponse(response)) {
      throw new Error("unexpected resolver response");
    }

    consecutiveFailures = 0;

    for (const [videoId, resolution] of Object.entries(response.results)) {
      resolutions.set(videoId, resolution.publishedDate ?? null);
    }

    // Anything the worker did not answer for stays unresolved rather than
    // being assumed safe.
    for (const videoId of batch) {
      if (!(videoId in response.results)) requested.delete(videoId);
    }

    evaluateCards();
    evaluateWatchPage();
  } catch (error) {
    // The worker restarts, and the whole extension context is torn down on
    // reload; both surface here. Let the ids be retried, but back off so a
    // permanently broken worker does not spin against YouTube's DOM churn.
    for (const videoId of batch) requested.delete(videoId);

    consecutiveFailures += 1;
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      backoffUntil = Date.now() + RESOLUTION_BACKOFF_MS;
      consecutiveFailures = 0;
      debug("resolution backoff engaged", error);
    }
  }
}

// ---------------------------------------------------------------- watch page

function evaluateWatchPage(): void {
  const videoId = currentWatchVideoId(window.location);

  if (!videoId) {
    if (guardedVideoId !== null) {
      guardedVideoId = null;
      setWatchState("idle");
    }
    return;
  }

  if (guardedVideoId === videoId) {
    // Already decided. Re-assert the block if YouTube's SPA took the overlay
    // with it during a partial re-render.
    if (blockedVideoId === videoId && !isBlockOverlayPresent()) {
      showBlockOverlay({
        virtualDate: settings.virtualDate,
        publishedDate: resolutions.get(videoId) ?? null
      });
    }
    return;
  }

  // Fast path: the watch page carries its own publication date in microformat
  // metadata, so the video the user is actually on is usually decided without
  // any network request at all.
  const fromDocument = calendarDateFromIso(readDocumentPublicationMeta());
  if (fromDocument && !resolutions.has(videoId)) {
    resolutions.set(videoId, fromDocument);
  }

  const known = resolutions.has(videoId)
    ? resolutions.get(videoId) ?? null
    : undefined;

  if (known === undefined) {
    setWatchState("pending");
    if (!requested.has(videoId)) void requestResolutions([videoId]);
    return;
  }

  const state = decideCardState(known, settings);
  guardedVideoId = videoId;

  const allowed =
    state === "visible" ||
    (state === "unknown" && settings.unknownPolicy === "show");

  if (allowed) {
    blockedVideoId = null;
    setWatchState("allowed");
    return;
  }

  blockedVideoId = videoId;
  showBlockOverlay({ virtualDate: settings.virtualDate, publishedDate: known });
}

/**
 * Auto-start only inside a real extension content script. `chrome.runtime.id`
 * is present there and absent in the test harness, which starts an instance
 * itself so it can also stop it.
 */
if (typeof chrome !== "undefined" && typeof chrome.runtime?.id === "string") {
  void start();
}
