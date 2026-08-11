/**
 * A bounded work queue.
 *
 * A YouTube feed hands us fifty cards at once and infinite scroll keeps them
 * coming. Firing fifty simultaneous watch-page fetches would be slower than
 * doing them six at a time (head-of-line blocking on the connection pool),
 * would look like scraping from YouTube's side, and would compete with the
 * page's own requests for bandwidth the user can actually see.
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
  #active = 0;
  #sequence = 0;
  #pending: QueuedTask<never>[] = [];

  constructor(concurrency: number = DEFAULT_CONCURRENCY) {
    this.#concurrency = Math.max(1, concurrency);
  }

  get size(): number {
    return this.#pending.length;
  }

  get active(): number {
    return this.#active;
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
      const next = this.#takeNext();
      if (!next) return;

      this.#active += 1;

      // The task's own rejection is forwarded to its caller; the queue itself
      // must never reject, or one bad fetch would stall the pump.
      void next
        .run()
        .then(next.resolve, next.reject)
        .finally(() => {
          this.#active -= 1;
          this.#pump();
        });
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
