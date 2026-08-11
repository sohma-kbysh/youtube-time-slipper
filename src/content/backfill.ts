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
import { CONTINUATION_SELECTOR, isInInactiveTree } from "./adapters.js";

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

/**
 * Continuation elements already activated on the current page.
 *
 * YouTube normally replaces the sentinel after a page arrives. Re-triggering
 * the same element can submit the same continuation token twice and append a
 * duplicate batch, so an element gets exactly one activation.
 */
let triggeredContinuations = new WeakSet<HTMLElement>();

export function resetContinuationTracking(): void {
  triggeredContinuations = new WeakSet<HTMLElement>();
}

function releaseCurrentContinuation(): void {
  const sentinel = currentContinuation();
  if (sentinel) triggeredContinuations.delete(sentinel);
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
  /** A continuation was activated and has not produced any observed cards yet. */
  #awaitingGrowth = false;
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
    this.#awaitingGrowth = false;
    this.#lastRunAt = 0;
    this.#lastTotal = -1;
    this.#status = "idle";
  }

  /** Let the user spend another round after we have given up. */
  requestAnother(allowScroll = true): void {
    this.#idleRounds = 0;
    this.#rounds = Math.min(this.#rounds, this.#maxRounds - 1);
    this.#awaitingGrowth = false;
    this.#lastRunAt = this.#now();
    this.#status = "loading";

    // An explicit user retry is allowed to reactivate a sentinel that may have
    // missed its first intersection/scroll notification. Automatic scans
    // still retain the one-activation guarantee.
    releaseCurrentContinuation();
    if (this.#requestMore(allowScroll)) {
      this.#rounds += 1;
      this.#awaitingGrowth = true;
    }
  }

  update(input: BackfillInput): BackfillStatus {
    const hadBaseline = this.#lastTotal >= 0;
    const grew = hadBaseline && input.total > this.#lastTotal;
    this.#lastTotal = input.total;

    // A response can arrive after the idle timeout. Growth is authoritative:
    // leave the exhausted state and give the new batch a chance to expose its
    // replacement continuation.
    if (grew) {
      this.#idleRounds = 0;
      this.#awaitingGrowth = false;
      // Some layouts retain one `#continuations` element and replace only its
      // internal token. Growth proves the prior request completed, so that
      // element may now safely represent the next page.
      releaseCurrentContinuation();
      if (this.#status === "exhausted") this.#status = "loading";
    }

    if (input.visible >= this.#targetVisible) {
      this.#status = "satisfied";
      return this.#status;
    }

    const now = this.#now();

    // Exhausted feeds have no timer running. A later YouTube mutation may add
    // a replacement sentinel without changing the card count, so probe once
    // when such a scan reaches us. `triggerContinuation` guarantees that this
    // can never reactivate the old sentinel. A successful probe starts a fresh
    // bounded wait; a failed one remains exhausted and schedules no loop.
    if (this.#status === "exhausted" && !grew) {
      if (
        this.#rounds < this.#maxRounds &&
        this.#requestMore(input.allowScroll)
      ) {
        this.#rounds += 1;
        this.#idleRounds = 0;
        this.#awaitingGrowth = true;
        this.#lastRunAt = now;
        this.#status = "loading";
      }
      return this.#status;
    }

    // A feed that was satisfied can become sparse again when YouTube recycles
    // or removes cards. Treat that as loading even during the interval grace,
    // otherwise no follow-up scan would be scheduled.
    if (this.#status === "satisfied") this.#status = "loading";

    if (now - this.#lastRunAt < MIN_INTERVAL_MS) {
      // Still waiting for the last request to land.
      return this.#status === "idle" ? "loading" : this.#status;
    }

    let countedIdle = false;

    // One elapsed wait with no cards is one idle observation. In particular,
    // the failed probe of an already-claimed sentinel below must not count as
    // a second idle round in the same update.
    if (this.#awaitingGrowth && !grew) {
      this.#awaitingGrowth = false;
      this.#idleRounds += 1;
      countedIdle = true;
    }

    this.#lastRunAt = now;

    let asked = false;
    if (this.#rounds < this.#maxRounds) {
      asked = this.#requestMore(input.allowScroll);
      if (asked) {
        this.#rounds += 1;
        this.#idleRounds = 0;
        this.#awaitingGrowth = true;
      } else if (!grew && !countedIdle) {
        this.#idleRounds += 1;
      }
    } else if (!grew && !countedIdle) {
      // The request budget is spent, but retain the same bounded grace period
      // for the final in-flight response before declaring exhaustion.
      this.#idleRounds += 1;
    }

    debug(
      `backfill round ${this.#rounds}: visible=${input.visible} total=${input.total} ` +
        `idle=${this.#idleRounds} awaiting=${this.#awaitingGrowth} asked=${asked}`
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
  const sentinel = currentContinuation();
  if (!sentinel) return false;
  if (triggeredContinuations.has(sentinel)) return false;

  // Claim the sentinel before dispatching any events. YouTube can synchronously
  // mutate the feed in response to scroll, and a nested scan must still see it
  // as already activated.
  triggeredContinuations.add(sentinel);

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

function currentContinuation(): HTMLElement | null {
  const sentinels = document.querySelectorAll<HTMLElement>(CONTINUATION_SELECTOR);
  for (let index = sentinels.length - 1; index >= 0; index -= 1) {
    const sentinel = sentinels[index];
    if (sentinel && !isInInactiveTree(sentinel)) return sentinel;
  }
  return null;
}
