/**
 * A bounded work queue.
 *
 * A YouTube feed hands us fifty cards at once and infinite scroll keeps them
 * coming. Concurrency and optional start spacing keep fallback watch-page
 * traffic bounded; the service worker configures the conservative production
 * limits while unit-test and non-network queues can use the zero-delay default.
 */

export const DEFAULT_CONCURRENCY = 6;

interface QueuedTask<T> {
  run: () => Promise<T>;
  priority: number;
  /** Tie-break so equal priorities keep submission order. */
  sequence: number;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export class FetchQueue {
  #concurrency: number;
  #minIntervalMs: number;
  #active = 0;
  #sequence = 0;
  #pending: QueuedTask<never>[] = [];
  #lastStartedAt = Number.NEGATIVE_INFINITY;
  #wakeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    concurrency: number = DEFAULT_CONCURRENCY,
    minIntervalMs: number = 0
  ) {
    this.#concurrency = Math.max(1, concurrency);
    this.#minIntervalMs = Math.max(0, minIntervalMs);
  }

  get size(): number {
    return this.#pending.length;
  }

  get active(): number {
    return this.#active;
  }

  /** Reject work that has not started yet; already-running tasks are untouched. */
  cancelPending(reason: unknown): number {
    const pending = this.#pending.splice(0);
    if (this.#wakeTimer !== null) {
      clearTimeout(this.#wakeTimer);
      this.#wakeTimer = null;
    }
    for (const task of pending) task.reject(reason);
    return pending.length;
  }

  /**
   * Schedule work. Higher priority runs first; equal priorities run in the
   * order they were submitted.
   */
  run<T>(task: () => Promise<T>, priority = 0): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const queued = {
        run: task,
        priority,
        sequence: this.#sequence++,
        resolve,
        reject
      } as unknown as QueuedTask<never>;

      this.#pending.push(queued);
      this.#pump();
    });
  }

  #pump(): void {
    while (this.#active < this.#concurrency && this.#pending.length > 0) {
      const wait = this.#minIntervalMs - (Date.now() - this.#lastStartedAt);
      if (wait > 0) {
        if (this.#wakeTimer === null) {
          this.#wakeTimer = setTimeout(() => {
            this.#wakeTimer = null;
            this.#pump();
          }, wait);
        }
        return;
      }

      const next = this.#takeNext();
      if (!next) return;

      this.#active += 1;
      this.#lastStartedAt = Date.now();

      // The task's own rejection is forwarded to its caller; the queue itself
      // must never reject, or one bad fetch would stall the pump.
      void next
        .run()
        .then(next.resolve, next.reject)
        .finally(() => {
          this.#active -= 1;
          this.#pump();
        });

      // A positive interval intentionally starts at most one task per pump;
      // the timer above controls when the next request may begin.
      if (this.#minIntervalMs > 0) continue;
    }
  }

  #takeNext(): QueuedTask<never> | undefined {
    let bestIndex = 0;
    for (let index = 1; index < this.#pending.length; index += 1) {
      const candidate = this.#pending[index]!;
      const best = this.#pending[bestIndex]!;
      if (
        candidate.priority > best.priority ||
        (candidate.priority === best.priority && candidate.sequence < best.sequence)
      ) {
        bestIndex = index;
      }
    }

    return this.#pending.splice(bestIndex, 1)[0];
  }
}
