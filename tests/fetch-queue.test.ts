import { describe, expect, it } from "vitest";

import { DEFAULT_CONCURRENCY, FetchQueue } from "../src/background/fetch-queue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("FetchQueue", () => {
  it("never runs more than the configured number of tasks at once", async () => {
    const queue = new FetchQueue(DEFAULT_CONCURRENCY);

    let running = 0;
    let peak = 0;

    const tasks = Array.from({ length: 50 }, () =>
      queue.run(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 1));
        running -= 1;
      })
    );

    await Promise.all(tasks);

    expect(peak).toBeLessThanOrEqual(DEFAULT_CONCURRENCY);
    expect(peak).toBeGreaterThan(1);
  });

  it("runs higher priorities first and keeps submission order within a priority", async () => {
    const queue = new FetchQueue(1);
    const order: string[] = [];

    const gate = deferred<void>();

    // Occupy the single slot so everything else has to queue behind it.
    const blocking = queue.run(async () => {
      await gate.promise;
      order.push("blocking");
    });

    const queued = [
      queue.run(async () => void order.push("low"), -10),
      queue.run(async () => void order.push("high"), 10),
      queue.run(async () => void order.push("mid-first"), 0),
      queue.run(async () => void order.push("mid-second"), 0)
    ];

    gate.resolve();
    await Promise.all([blocking, ...queued]);

    expect(order).toEqual(["blocking", "high", "mid-first", "mid-second", "low"]);
  });

  it("keeps draining after a task rejects, and forwards the rejection", async () => {
    const queue = new FetchQueue(2);

    const failing = queue.run(async () => {
      throw new Error("boom");
    });

    await expect(failing).rejects.toThrow("boom");
    await expect(queue.run(async () => "next")).resolves.toBe("next");
  });
});
