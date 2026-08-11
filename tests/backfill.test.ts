import { describe, expect, it, vi } from "vitest";

import {
  Backfill,
  IDLE_LIMIT,
  MAX_ROUNDS,
  MIN_INTERVAL_MS,
  TARGET_VISIBLE
} from "../src/content/backfill";

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
    const { round, requestMore } = harness();

    round(1, 40); // first round establishes the baseline
    let status = "loading";
    for (let index = 0; index < IDLE_LIMIT + 2; index += 1) {
      status = round(1, 40);
    }

    expect(status).toBe("exhausted");
    // It stopped rather than hammering YouTube forever.
    expect(requestMore.mock.calls.length).toBeLessThanOrEqual(IDLE_LIMIT + 2);
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
    const { backfill, round, requestMore } = harness();

    round(1, 40);
    for (let index = 0; index < IDLE_LIMIT + 2; index += 1) round(1, 40);
    expect(backfill.status).toBe("exhausted");

    backfill.requestAnother();

    expect(backfill.status).toBe("loading");
    expect(requestMore).toHaveBeenCalledWith(true);
  });

  it("starts over on navigation", () => {
    const { backfill, round } = harness();

    round(1, 40);
    for (let index = 0; index < IDLE_LIMIT + 2; index += 1) round(1, 40);
    expect(backfill.status).toBe("exhausted");

    backfill.reset();

    expect(backfill.status).toBe("idle");
    expect(backfill.rounds).toBe(0);
  });
});
