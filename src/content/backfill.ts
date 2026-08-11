/**
 * Refilling a feed that filtering has emptied.
 *
 * This is the difference between "YouTube from 2012" and "YouTube with most of
 * it deleted". Today's recommendations are mostly recent, so a distant virtual
 * present can leave three videos on a home page built for forty. YouTube will
 * happily hand over more — its feeds are endless — so we keep asking until
 * enough survivors have accumulated or it stops producing new items.
 *
 * This does not make old videos appear where there are none. It exhausts what
 * the current recommender is willing to offer; if that runs out, the feed says
 * so instead of looking broken.
 */

import { debug } from "../core/log.js";
import { CONTINUATION_SELECTOR } from "./adapters.js";

/** Stop asking once this many videos are visible. */
export const TARGET_VISIBLE = 20;

/** Hard cap on requests per page, so a bad cutoff cannot hammer YouTube. */
export const MAX_ROUNDS = 25;

/** Minimum spacing between requests. */
export const MIN_INTERVAL_MS = 700;

/** Give up after this many rounds that produced no new cards. */
export const IDLE_LIMIT = 3;

export type BackfillStatus =
  | "idle"
  | "loading"
  | "satisfied"
  | "exhausted";

export interface BackfillInput {
  /** Cards currently visible to the user. */
  visible: number;
  /** Cards on the page, hidden or not. Growth means YouTube gave us more. */
  total: number;
  /** Whether scrolling the sentinel into view is acceptable right now. */
  allowScroll: boolean;
}

export interface BackfillDependencies {
  now?: () => number;
  /** Ask YouTube for the next page. Returns false when there is nothing to ask. */
  requestMore?: (allowScroll: boolean) => boolean;
  targetVisible?: number;
  maxRounds?: number;
}

export interface BackfillLimits {
  targetVisible: number;
  maxRounds: number;
}

/**
 * Drives the "ask for more" loop.
 *
 * Kept as a small state machine with injected effects so its stopping rules —
 * the part that must not spin — are testable without a browser.
 */
export class Backfill {
  #now: () => number;
  #requestMore: (allowScroll: boolean) => boolean;

  #rounds = 0;
  #idleRounds = 0;
  #lastRunAt = 0;
  #lastTotal = -1;
  #status: BackfillStatus = "idle";

  #targetVisible = TARGET_VISIBLE;
  #maxRounds = MAX_ROUNDS;

  constructor(deps: BackfillDependencies = {}) {
    this.#now = deps.now ?? Date.now;
    this.#requestMore = deps.requestMore ?? triggerContinuation;
    if (deps.targetVisible !== undefined) this.#targetVisible = deps.targetVisible;
    if (deps.maxRounds !== undefined) this.#maxRounds = deps.maxRounds;
  }

  /**
   * Apply the user's limits. Called whenever settings change, so raising the
   * target takes effect on the page already open.
   */
  configure(limits: Partial<BackfillLimits>): void {
    if (limits.targetVisible !== undefined) {
      this.#targetVisible = Math.max(1, Math.round(limits.targetVisible));
    }
    if (limits.maxRounds !== undefined) {
      this.#maxRounds = Math.max(1, Math.round(limits.maxRounds));
    }
  }

  get targetVisible(): number {
    return this.#targetVisible;
  }

  get status(): BackfillStatus {
    return this.#status;
  }

  get rounds(): number {
    return this.#rounds;
  }

  /** Called on navigation: the next page starts with a fresh budget. */
  reset(): void {
    this.#rounds = 0;
    this.#idleRounds = 0;
    this.#lastRunAt = 0;
    this.#lastTotal = -1;
    this.#status = "idle";
  }

  /** Let the user spend another round after we have given up. */
  requestAnother(allowScroll = true): void {
    this.#idleRounds = 0;
    this.#rounds = Math.min(this.#rounds, this.#maxRounds - 1);
    this.#lastRunAt = 0;
    this.#status = "loading";
    this.#requestMore(allowScroll);
  }

  update(input: BackfillInput): BackfillStatus {
    if (input.visible >= this.#targetVisible) {
      this.#status = "satisfied";
      return this.#status;
    }

    if (this.#rounds >= this.#maxRounds || this.#idleRounds >= IDLE_LIMIT) {
      this.#status = "exhausted";
      return this.#status;
    }

    const now = this.#now();
    if (now - this.#lastRunAt < MIN_INTERVAL_MS) {
      // Still waiting for the last request to land.
      return this.#status === "idle" ? "loading" : this.#status;
    }

    // No growth since the last round means YouTube is not producing more —
    // either the feed is finished or the continuation never fired.
    if (this.#lastTotal >= 0 && input.total <= this.#lastTotal) {
      this.#idleRounds += 1;
    } else {
      this.#idleRounds = 0;
    }

    this.#lastTotal = input.total;
    this.#lastRunAt = now;
    this.#rounds += 1;

    const asked = this.#requestMore(input.allowScroll);
    if (!asked) this.#idleRounds += 1;

    debug(
      `backfill round ${this.#rounds}: visible=${input.visible} total=${input.total} ` +
        `idle=${this.#idleRounds} asked=${asked}`
    );

    this.#status = this.#idleRounds >= IDLE_LIMIT ? "exhausted" : "loading";
    return this.#status;
  }
}

/**
 * Ask YouTube for the next page by bringing its continuation sentinel into
 * view, which is what its own infinite scroll waits for.
 *
 * Scrolling is only allowed while the page is nearly empty — which is the only
 * time this runs — so the movement is small and the user is not yanked away
 * from something they were reading.
 */
export function triggerContinuation(allowScroll: boolean): boolean {
  const sentinels = document.querySelectorAll<HTMLElement>(CONTINUATION_SELECTOR);
  const sentinel = sentinels[sentinels.length - 1];
  if (!sentinel) return false;

  if (allowScroll && typeof sentinel.scrollIntoView === "function") {
    try {
      sentinel.scrollIntoView({ block: "end", behavior: "auto" });
    } catch {
      // Not being able to scroll is not a reason to stop: the scroll event
      // below still gives YouTube a chance to notice.
    }
  }

  // Belt and braces for surfaces that listen for scrolling rather than
  // observing intersection.
  window.dispatchEvent(new Event("scroll"));
  return true;
}
