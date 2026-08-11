/**
 * Persistent cache of publication dates.
 *
 * A video's upload date never changes, so a successful lookup is cached
 * indefinitely: after the first pass over a feed, filtering costs no network at
 * all. Failures are a different matter — a `null` can mean the network was
 * down, YouTube served an experiment we cannot parse, or the video genuinely
 * has no metadata — so negatives expire after a day and are re-tried.
 *
 * IndexedDB rather than chrome.storage.local because this grows without bound
 * with browsing, and because a service worker is torn down constantly: state
 * that only exists in a module-level variable does not survive, so the cache
 * has to be on disk to be worth anything.
 */

import type { CalendarDate, ResolutionSource, VideoId } from "../core/types.js";

export const DB_NAME = "youtube-time-slipper";
export const STORE_NAME = "publicationDates";
const DB_VERSION = 1;

/** Negative results are re-tried after this long. */
export const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;

export interface CacheRecord {
  videoId: VideoId;
  publishedDate: CalendarDate | null;
  source: ResolutionSource;
  /** Which parser produced this. Bumping it invalidates cached unknowns. */
  parserVersion: number;
  fetchedAt: number;

  /** Video title, when the page was read. Used by the discovery shelf. */
  title?: string | null;

  /**
   * Related video ids from the same page read.
   *
   * `undefined` means "this record predates related-id extraction", which is
   * different from `[]` ("the page had none"): the first is worth re-fetching
   * for discovery, the second is not.
   */
  related?: VideoId[];
}

export interface PublicationCache {
  getMany(videoIds: VideoId[]): Promise<Map<VideoId, CacheRecord>>;
  put(record: CacheRecord): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Whether a cached record can still be trusted.
 *
 * A known date stays valid forever, including across parser versions — the
 * date was correct when it was read and upload dates are immutable. An unknown
 * is only valid while it is both recent and produced by the current parser, so
 * that improving the parser automatically re-resolves everything it used to
 * miss.
 */
export function isUsable(
  record: CacheRecord,
  parserVersion: number,
  now: number = Date.now()
): boolean {
  if (record.publishedDate !== null) return true;
  if (record.parserVersion !== parserVersion) return false;
  return now - record.fetchedAt < NEGATIVE_TTL_MS;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "videoId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB open blocked"));
  });
}

export class IndexedDbCache implements PublicationCache {
  #db: Promise<IDBDatabase> | null = null;

  #database(): Promise<IDBDatabase> {
    if (!this.#db) {
      this.#db = openDatabase().catch((error) => {
        // Allow a later call to retry rather than poisoning the cache forever.
        this.#db = null;
        throw error;
      });
    }
    return this.#db;
  }

  async getMany(videoIds: VideoId[]): Promise<Map<VideoId, CacheRecord>> {
    const found = new Map<VideoId, CacheRecord>();
    if (videoIds.length === 0) return found;

    const db = await this.#database();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);

      for (const videoId of videoIds) {
        const request = store.get(videoId);
        request.onsuccess = () => {
          const record = request.result as CacheRecord | undefined;
          if (record) found.set(videoId, record);
        };
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    return found;
  }

  async put(record: CacheRecord): Promise<void> {
    const db = await this.#database();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async clear(): Promise<void> {
    const db = await this.#database();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

/**
 * In-memory cache. Used by tests, and as a fallback when IndexedDB is
 * unavailable (private-mode edge cases) so that resolution degrades to "slower"
 * rather than "broken".
 */
export class MemoryCache implements PublicationCache {
  #records = new Map<VideoId, CacheRecord>();

  async getMany(videoIds: VideoId[]): Promise<Map<VideoId, CacheRecord>> {
    const found = new Map<VideoId, CacheRecord>();
    for (const videoId of videoIds) {
      const record = this.#records.get(videoId);
      if (record) found.set(videoId, record);
    }
    return found;
  }

  async put(record: CacheRecord): Promise<void> {
    this.#records.set(record.videoId, record);
  }

  async clear(): Promise<void> {
    this.#records.clear();
  }
}
