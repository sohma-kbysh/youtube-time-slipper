/**
 * Content-script orchestrator.
 *
 * Owns the loop: observe the page, ask the worker for dates it does not have,
 * and apply the policy to every card. Everything it does is reversible — when
 * the extension is switched off it removes every attribute and node it added,
 * and YouTube is left exactly as it was.
 */

import { calendarDateFromIso } from "../core/date.js";
import {
  browserLanguages,
  createTranslator,
  resolveLanguage,
  type Translator
} from "../core/i18n.js";
import { debug, warn } from "../core/log.js";
import {
  MAX_VIDEO_IDS_PER_REQUEST,
  MESSAGE_DISCOVER_ERA,
  MESSAGE_RESOLVE_VIDEO_DATES,
  isEraDiscoveredResponse,
  isVideoDatesResolvedResponse
} from "../core/messages.js";
import { decideCardState, isActive, isSurfaceEnabled } from "../core/policy.js";
import type { CalendarDate, Settings, VideoId } from "../core/types.js";
import { defaultSettings, loadSettings, onSettingsChanged } from "../storage/settings.js";
import {
  detectPageSurface,
  readDocumentPublicationMeta,
  readPageContext
} from "./adapters.js";
import { Backfill } from "./backfill.js";
import {
  removeDiscovery as removeHistoricalFeed,
  renderDiscovery as renderHistoricalFeed,
  setDiscoverRefreshHandler as setHistoricalFeedRefreshHandler
} from "./discover.js";
import { applyEraFeatures, resetEraFeatures } from "./era.js";
import { mountBadge, removeBadge, updateBadge } from "./badge.js";
import {
  removeEmptyState,
  renderEmptyState,
  setLoadMoreHandler
} from "./empty-state.js";
import { collapseEmptyShelves, countVisibleCards, resetShelves } from "./shelf.js";
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
let resolutionRateLimited = false;

/** The video the watch guard has already ruled on, so it is not re-run. */
let guardedVideoId: VideoId | null = null;

/** The video currently being blocked, if any. */
let blockedVideoId: VideoId | null = null;

let observer: MutationObserver | null = null;
let unsubscribeSettings: (() => void) | null = null;
const documentListeners: Array<[EventTarget, string, EventListener]> = [];

let t: Translator = createTranslator("en");

const backfill = new Backfill();

/**
 * Set once the user scrolls by hand. After that we stop moving the viewport
 * for them, and refilling continues only when they ask for it.
 */
let userHasScrolled = false;

let historicalFeedRunning = false;
let historicalFeedDone = false;
let historicalVideos: Array<{
  videoId: VideoId;
  title: string | null;
  publishedDate: CalendarDate;
  channelTitle?: string;
}> = [];
let historicalSource: "api" | "related" | "none" = "none";

/** Surfaces where refilling makes sense; a watch page is not a feed. */
const FEED_SURFACES = new Set(["home", "search", "subscriptions", "channel", "playlists"]);

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
  t = createTranslator(resolveLanguage(settings.language, browserLanguages()));
  applyRootFlags(settings, active);

  if (!active) {
    teardown();
    return;
  }

  updateBadge(settings, t);
  backfill.configure({
    targetVisible: settings.fillTargetVisible,
    maxRounds: settings.fillMaxRounds
  });

  // Dates are immutable, so a changed virtual date needs no re-resolution —
  // only re-classification of what we already know. A different cutoff can
  // change how much survives, so the refill budget starts again.
  guardedVideoId = null;
  backfill.reset();
  // A different window means different discoveries are possible.
  historicalFeedDone = false;
  historicalVideos = [];
  historicalSource = "none";
  resolutionRateLimited = false;
  if (options.rescan) scheduleScan(true);
}

function teardown(): void {
  resetAllCards();
  resetShelves();
  resetEraFeatures();
  removeEmptyState();
  removeHistoricalFeed();
  historicalFeedDone = false;
  historicalFeedRunning = false;
  historicalVideos = [];
  historicalSource = "none";
  resolutionRateLimited = false;
  clearRootFlags();
  removeBlockOverlay();
  setWatchState("idle");
  removeBadge();
  backfill.reset();
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

  // Once the user takes over scrolling, refilling stops moving the viewport.
  const scrolled: EventListener = () => {
    userHasScrolled = true;
  };
  for (const type of ["wheel", "touchmove", "keydown"]) {
    window.addEventListener(type, scrolled, { passive: true });
    documentListeners.push([window, type, scrolled]);
  }

  setLoadMoreHandler(() => {
    backfill.requestAnother(true);
    scheduleScan(false);
  });

  setHistoricalFeedRefreshHandler(() => {
    historicalFeedDone = false;
    historicalVideos = [];
    historicalSource = "none";
    const { visible } = countVisibleCards(settings);
    void runHistoricalFeed(visible);
  });
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

  // One unexpected DOM condition must not abort the pass and leave cards stuck
  // in `pending` — which, since pending is hidden, would look like the
  // extension had eaten the page.
  try {
    detectNavigation();
    evaluateWatchPage();
    evaluateCards();
    applyEraFeatures(settings);
    refillFeed();
    mountBadge(settings, t);
  } catch (error) {
    warn("scan failed", error);
  }
}

/**
 * Keep a filtered feed from collapsing into a blank page.
 *
 * Emptied shelves are removed first, then — if too little survived — YouTube is
 * asked for more, and the panel explains what is happening. None of this
 * relaxes the filter: it only changes how much material the filter is applied
 * to.
 */
function refillFeed(): void {
  const surface = detectPageSurface(window.location);
  if (!FEED_SURFACES.has(surface)) {
    removeEmptyState();
    removeHistoricalFeed();
    return;
  }

  collapseEmptyShelves(settings);

  const { visible, total } = countVisibleCards(settings);

  // A native card can arrive after the API response. Prefer YouTube's own card
  // and remove the generated duplicate from the historical grid.
  const deduplicated = historicalVideos.filter(
    (video) => !resolutions.has(video.videoId)
  );
  if (deduplicated.length !== historicalVideos.length) {
    historicalVideos = deduplicated;
    renderHistoricalResults();
  }

  const combinedVisible = visible + historicalVideos.length;
  const combinedTotal = total + historicalVideos.length;

  // Cards still being resolved are not failures yet; waiting avoids asking for
  // more the instant the page loads, before anything has had a chance to pass.
  const stillResolving = requested.size > resolutions.size;

  // Enough combined native/API cards always wins, even if unrelated native
  // cards are still resolving in the background.
  if (combinedVisible >= backfill.targetVisible) {
    backfill.update({
      visible: combinedVisible,
      total: combinedTotal,
      allowScroll: false
    });
    removeEmptyState();
    return;
  }

  // With a configured API key, historical search does not need native cards
  // as graph-walk seeds and can run alongside their batched date resolution.
  const canStartHistoricalFeed =
    settings.discoverEra &&
    !historicalFeedDone &&
    (!stillResolving || settings.apiKey.length > 0);

  if (canStartHistoricalFeed && !historicalFeedRunning) {
    void runHistoricalFeed(visible);
  }

  if (stillResolving) {
    if (historicalFeedRunning) {
      removeEmptyState();
      return;
    }
    renderEmptyState(
      {
        status: "loading",
        visible: combinedVisible,
        total: combinedTotal,
        virtualDate: settings.virtualDate,
        rateLimited: resolutionRateLimited
      },
      t
    );
    return;
  }

  // Historical search is the first refill source. It can directly ask for the
  // chosen era, unlike repeatedly loading today's recommendations.
  if (settings.discoverEra && !historicalFeedDone) {
    removeEmptyState();
    return;
  }

  if (resolutionRateLimited) {
    renderEmptyState(
      {
        status: "exhausted",
        visible: combinedVisible,
        total: combinedTotal,
        virtualDate: settings.virtualDate,
        rateLimited: true
      },
      t
    );
    return;
  }

  if (!settings.fillFeed) {
    // With refilling switched off, a thin page still deserves an explanation —
    // it just does not get more videos requested for it.
    const status = combinedVisible < backfill.targetVisible ? "exhausted" : "satisfied";

    renderEmptyState(
      { status, visible: combinedVisible, total: combinedTotal, virtualDate: settings.virtualDate, rateLimited: resolutionRateLimited },
      t
    );
    return;
  }

  const status = backfill.update({
    visible: combinedVisible,
    total: combinedTotal,
    allowScroll: !userHasScrolled
  });

  renderEmptyState(
    { status, visible: combinedVisible, total: combinedTotal, virtualDate: settings.virtualDate, rateLimited: resolutionRateLimited },
    t
  );

  // Ask again shortly: the next batch arrives asynchronously, and the mutation
  // observer may not fire if YouTube appended nothing.
  if (status === "loading") scheduleScan(false);

}

// ---------------------------------------------------------- historical feed

/**
 * Build the missing portion of the feed from an authoritative API period
 * search, with the related graph as the worker's no-key/failure fallback.
 */
async function runHistoricalFeed(nativeVisible: number): Promise<void> {
  if (!settings.discoverEra) return;
  if (historicalFeedRunning || historicalFeedDone) return;

  // Seeds are the videos already on the page that passed the filter: known to
  // be in the window, and close to what the user is actually looking at.
  const seeds = [...resolutions.entries()]
    .filter(([, date]) => date !== null && decideCardState(date, settings) === "visible")
    .map(([videoId]) => videoId)
    .slice(0, 12);

  historicalFeedRunning = true;
  renderHistoricalFeed({ status: "searching" }, t);

  try {
    // What the page is about, so the API can be asked the era version of
    // the user's actual question rather than a generic one.
    const context = readPageContext(window.location);

    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_DISCOVER_ERA,
      seeds,
      start: settings.rangeStart,
      end: settings.virtualDate,
      limit: Math.max(1, backfill.targetVisible - nativeVisible),
      exclude: [...resolutions.keys()],
      ...context
    });

    if (!isEraDiscoveredResponse(response)) throw new Error("unexpected response");

    const seen = new Set<VideoId>(resolutions.keys());
    historicalVideos = response.videos.filter((video) => {
      if (seen.has(video.videoId)) return false;
      if (decideCardState(video.publishedDate, settings) !== "visible") return false;
      seen.add(video.videoId);
      return true;
    });
    historicalSource = response.source;
    historicalFeedDone = true;
    renderHistoricalResults();
  } catch (error) {
    debug("discovery failed", error);
    historicalVideos = [];
    historicalSource = "none";
    historicalFeedDone = true;
    removeHistoricalFeed();
  } finally {
    historicalFeedRunning = false;
    scheduleScan(true);
  }
}

function renderHistoricalResults(): void {
  if (historicalVideos.length === 0 || historicalSource === "none") {
    removeHistoricalFeed();
    return;
  }

  renderHistoricalFeed({
    status: "results",
    videos: historicalVideos,
    source: historicalSource
  }, t);
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

  // A new page gets a fresh refill budget, and the user starts at the top of
  // it, so it is fair to scroll for them again.
  backfill.reset();
  userHasScrolled = false;
  removeEmptyState();
  removeHistoricalFeed();
  historicalFeedDone = false;
  historicalVideos = [];
  historicalSource = "none";
  resolutionRateLimited = false;

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
    resolutionRateLimited = response.resolverStatus === "html-rate-limited";

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
        rangeStart: settings.rangeStart,
        publishedDate: resolutions.get(videoId) ?? null,
        t
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
  showBlockOverlay({
    virtualDate: settings.virtualDate,
    rangeStart: settings.rangeStart,
    publishedDate: known,
    t
  });
}

/**
 * Auto-start only inside a real extension content script. `chrome.runtime.id`
 * is present there and absent in the test harness, which starts an instance
 * itself so it can also stop it.
 */
if (typeof chrome !== "undefined" && typeof chrome.runtime?.id === "string") {
  void start();
}
