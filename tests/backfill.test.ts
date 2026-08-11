// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  Backfill,
  IDLE_LIMIT,
  MAX_ROUNDS,
  MIN_INTERVAL_MS,
  TARGET_VISIBLE,
  resetContinuationTracking,
  triggerContinuation
} from "../src/content/backfill";

beforeEach(() => {
  document.body.innerHTML = "";
  resetContinuationTracking();
});

/**
 * A clock the test drives by hand, so the interval rules are exercised without
 * waiting for real time.
 */
function harness(options: { requestMore?: () => boolean } = {}) {
  let time = 0;
  const requestMore = vi.fn(options.requestMore ?? (() => true));

  const backfill = new Backfill({
    now: () => time,
    requestMore
  });

  return {
    backfill,
    requestMore,
    advance(ms: number) {
      time += ms;
    },
    /** One round, with the clock moved past the interval first. */
    round(visible: number, total: number) {
      time += MIN_INTERVAL_MS;
      return backfill.update({ visible, total, allowScroll: true });
    }
  };
}

describe("Backfill", () => {
  it("does nothing once enough videos are visible", () => {
    const { backfill, requestMore } = harness();

    expect(backfill.update({ visible: TARGET_VISIBLE, total: 60, allowScroll: true })).toBe(
      "satisfied"
    );
    expect(requestMore).not.toHaveBeenCalled();
  });

  it("resumes loading when a previously satisfied feed loses cards", () => {
    const { backfill, round } = harness();
    backfill.configure({ targetVisible: 3 });

    expect(round(1, 10)).toBe("loading");
    expect(backfill.update({ visible: 3, total: 12, allowScroll: true })).toBe(
      "satisfied"
    );
    expect(backfill.update({ visible: 2, total: 11, allowScroll: true })).toBe(
      "loading"
    );
  });

  it("asks for more while the page is nearly empty", () => {
    const { round, requestMore } = harness();

    expect(round(2, 40)).toBe("loading");
    expect(requestMore).toHaveBeenCalledTimes(1);
  });

  it("keeps asking while YouTube keeps producing cards", () => {
    const { round, requestMore } = harness();

    let total = 40;
    for (let index = 0; index < 5; index += 1) {
      total += 20;
      expect(round(3, total)).toBe("loading");
    }

    expect(requestMore).toHaveBeenCalledTimes(5);
  });

  it("does not fire faster than the minimum interval", () => {
    const { backfill, advance, requestMore } = harness();

    advance(MIN_INTERVAL_MS);
    backfill.update({ visible: 1, total: 40, allowScroll: true });
    expect(requestMore).toHaveBeenCalledTimes(1);

    // The mutation observer fires many times while a batch lands; none of
    // those should turn into another request.
    for (let index = 0; index < 10; index += 1) {
      advance(10);
      expect(backfill.update({ visible: 1, total: 40, allowScroll: true })).toBe(
        "loading"
      );
    }

    expect(requestMore).toHaveBeenCalledTimes(1);
  });

  it("gives up when the page stops growing", () => {
    let firstRequest = true;
    const { round, requestMore } = harness({
      requestMore: () => {
        if (!firstRequest) return false;
        firstRequest = false;
        return true;
      }
    });

    round(1, 40); // first round establishes the baseline
    let status = "loading";
    for (let index = 0; index < IDLE_LIMIT && status !== "exhausted"; index += 1) {
      status = round(1, 40);
    }

    expect(status).toBe("exhausted");
    // The loading loop stops rather than hammering YouTube forever.
    expect(requestMore.mock.calls.length).toBeLessThanOrEqual(IDLE_LIMIT + 1);
  });

  it("counts one unchanged wait only once when the sentinel is already claimed", () => {
    let firstRequest = true;
    const { round } = harness({
      requestMore: () => {
        if (!firstRequest) return false;
        firstRequest = false;
        return true;
      }
    });

    expect(round(1, 40)).toBe("loading");

    // The elapsed wait and the failed probe refer to the same pending page;
    // they must not consume two idle rounds in one update.
    for (let index = 0; index < IDLE_LIMIT - 1; index += 1) {
      expect(round(1, 40)).toBe("loading");
    }
    expect(round(1, 40)).toBe("exhausted");
  });

  it("recovers when a slow response arrives after the idle timeout", () => {
    let firstRequest = true;
    const { backfill, round } = harness({
      requestMore: () => {
        if (!firstRequest) return false;
        firstRequest = false;
        return true;
      }
    });

    round(1, 40);
    for (let index = 0; index < IDLE_LIMIT; index += 1) round(1, 40);
    expect(backfill.status).toBe("exhausted");

    // YouTube can finish well after our bounded polling loop has stopped.
    expect(round(2, 60)).toBe("loading");
  });

  it("recovers when a replacement sentinel appears without card growth", () => {
    let firstRequest = true;
    let replacementAvailable = false;
    const { backfill, round, requestMore } = harness({
      requestMore: () => {
        if (firstRequest) {
          firstRequest = false;
          return true;
        }
        if (!replacementAvailable) return false;
        replacementAvailable = false;
        return true;
      }
    });

    round(1, 40);
    for (let index = 0; index < IDLE_LIMIT; index += 1) round(1, 40);
    expect(backfill.status).toBe("exhausted");

    replacementAvailable = true;
    expect(round(1, 40)).toBe("loading");
    expect(backfill.rounds).toBe(2);
    expect(requestMore).toHaveBeenLastCalledWith(true);
  });

  it("gives up when there is no continuation to trigger", () => {
    const { round } = harness({ requestMore: () => false });

    let status = "loading";
    for (let index = 0; index < IDLE_LIMIT + 1; index += 1) {
      status = round(0, 0);
    }

    expect(status).toBe("exhausted");
  });

  it("never exceeds the per-page round cap", () => {
    const { round, requestMore } = harness();

    let total = 0;
    for (let index = 0; index < MAX_ROUNDS * 2; index += 1) {
      total += 20; // always growing, so only the cap can stop it
      round(1, total);
    }

    expect(requestMore.mock.calls.length).toBeLessThanOrEqual(MAX_ROUNDS);
  });

  it("resumes when the user explicitly asks for more", () => {
    let firstRequest = true;
    const { backfill, round, requestMore } = harness({
      requestMore: () => {
        if (!firstRequest) return false;
        firstRequest = false;
        return true;
      }
    });

    round(1, 40);
    for (let index = 0; index < IDLE_LIMIT + 2; index += 1) round(1, 40);
    expect(backfill.status).toBe("exhausted");

    backfill.requestAnother();

    expect(backfill.status).toBe("loading");
    expect(requestMore).toHaveBeenCalledWith(true);
  });

  it("obeys a user-configured target", () => {
    const { backfill, round, requestMore } = harness();
    backfill.configure({ targetVisible: 60 });

    // The default target would have stopped here; the user asked for more.
    expect(round(TARGET_VISIBLE + 1, 80)).toBe("loading");
    expect(requestMore).toHaveBeenCalled();

    expect(round(60, 200)).toBe("satisfied");
  });

  it("obeys a user-configured round cap", () => {
    const { backfill, round, requestMore } = harness();
    backfill.configure({ maxRounds: 3 });

    let total = 0;
    for (let index = 0; index < 10; index += 1) {
      total += 20;
      round(1, total);
    }

    expect(requestMore.mock.calls.length).toBe(3);
  });

  it("takes limits from the constructor", () => {
    const requestMore = vi.fn(() => true);
    const backfill = new Backfill({ now: () => 10_000, requestMore, targetVisible: 3 });

    expect(backfill.targetVisible).toBe(3);
    expect(backfill.update({ visible: 3, total: 10, allowScroll: true })).toBe(
      "satisfied"
    );
  });

  it("starts over on navigation", () => {
    let firstRequest = true;
    const { backfill, round } = harness({
      requestMore: () => {
        if (!firstRequest) return false;
        firstRequest = false;
        return true;
      }
    });

    round(1, 40);
    for (let index = 0; index < IDLE_LIMIT + 2; index += 1) round(1, 40);
    expect(backfill.status).toBe("exhausted");

    backfill.reset();

    expect(backfill.status).toBe("idle");
    expect(backfill.rounds).toBe(0);
  });
});

describe("triggerContinuation", () => {
  function sentinel(): { element: HTMLElement; scrollIntoView: ReturnType<typeof vi.fn> } {
    const element = document.createElement("ytd-continuation-item-renderer");
    const scrollIntoView = vi.fn();
    Object.defineProperty(element, "scrollIntoView", { value: scrollIntoView });
    document.body.appendChild(element);
    return { element, scrollIntoView };
  }

  it("activates one sentinel only once", () => {
    const current = sentinel();

    expect(triggerContinuation(true)).toBe(true);
    expect(triggerContinuation(true)).toBe(false);
    expect(current.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("activates the replacement sentinel", () => {
    const first = sentinel();
    expect(triggerContinuation(true)).toBe(true);

    first.element.remove();
    const replacement = sentinel();

    expect(triggerContinuation(true)).toBe(true);
    expect(triggerContinuation(true)).toBe(false);
    expect(first.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(replacement.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("ignores a continuation retained inside an inactive SPA page", () => {
    const active = sentinel();
    const oldPage = document.createElement("section");
    oldPage.hidden = true;
    document.body.appendChild(oldPage);
    const inactive = sentinel();
    oldPage.appendChild(inactive.element);

    expect(triggerContinuation(true)).toBe(true);
    expect(active.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(inactive.scrollIntoView).not.toHaveBeenCalled();
  });

  it("starts a fresh sentinel budget when page tracking is reset", () => {
    const current = sentinel();

    expect(triggerContinuation(true)).toBe(true);
    resetContinuationTracking();
    expect(triggerContinuation(true)).toBe(true);
    expect(current.scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it("lets an explicit user retry reactivate the current sentinel", () => {
    const current = sentinel();
    const backfill = new Backfill({ now: () => 10_000 });

    expect(triggerContinuation(true)).toBe(true);
    backfill.requestAnother(true);

    expect(current.scrollIntoView).toHaveBeenCalledTimes(2);
    expect(backfill.status).toBe("loading");
  });

  it("reactivates a persistent sentinel only after card growth", () => {
    let now = 10_000;
    const current = sentinel();
    const backfill = new Backfill({ now: () => now });

    expect(backfill.update({ visible: 1, total: 40, allowScroll: true })).toBe(
      "loading"
    );
    expect(current.scrollIntoView).toHaveBeenCalledTimes(1);

    now += MIN_INTERVAL_MS;
    backfill.update({ visible: 2, total: 60, allowScroll: true });
    expect(current.scrollIntoView).toHaveBeenCalledTimes(2);

    now += MIN_INTERVAL_MS;
    backfill.update({ visible: 2, total: 60, allowScroll: true });
    expect(current.scrollIntoView).toHaveBeenCalledTimes(2);
  });
});
