/**
 * Quota accounting and response caching for the user's own API key.
 *
 * With a default allowance of 10,000 units a day and a search costing 100, the
 * user has about a hundred searches. Two things follow:
 *
 *  - They should be able to see what has been spent, in the popup, rather than
 *    discovering the limit by hitting it.
 *  - Identical searches must not be repeated. Revisiting the home page three
 *    times in an evening should cost one search, not three, so results are
 *    cached with a generous TTL — the answer to "what was published in 2011"
 *    does not change.
 *
 * Both live in `chrome.storage.local`, not IndexedDB: they are small, and the
 * popup needs to read the usage counter without opening a database.
 */

import { todayAsCalendarDate } from "../core/date.js";
import type { CalendarDate } from "../core/types.js";

const USAGE_KEY = "apiUsage";
const CACHE_KEY = "apiCache";

/** Cached searches expire after this long. */
export const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

/** Cap on cached searches, so storage cannot grow without bound. */
export const MAX_CACHE_ENTRIES = 60;

export interface ApiUsage {
  /** The local day these units were spent on. */
  day: CalendarDate;
  units: number;
}

export interface CachedSearch<T> {
  value: T;
  storedAt: number;
}

function isUsage(value: unknown): value is ApiUsage {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ApiUsage>;
  return typeof candidate.day === "string" && typeof candidate.units === "number";
}

/**
 * Units spent today.
 *
 * Rolls over on the *local* day, which is the day the user thinks in. Google's
 * quota resets at midnight Pacific, so the two are not the same window; the
 * counter is a guide to your own spending, not a mirror of Google's meter, and
 * the popup says so.
 */
export async function readUsage(now: Date = new Date()): Promise<ApiUsage> {
  const today = todayAsCalendarDate(now);

  try {
    const stored = await chrome.storage.local.get(USAGE_KEY);
    const usage = stored?.[USAGE_KEY];

    if (isUsage(usage) && usage.day === today) return usage;
  } catch {
    // Storage unavailable: report a clean slate rather than blocking use.
  }

  return { day: today, units: 0 };
}

export async function recordUsage(
  units: number,
  now: Date = new Date()
): Promise<ApiUsage> {
  const current = await readUsage(now);
  const next: ApiUsage = { day: current.day, units: current.units + units };

  try {
    await chrome.storage.local.set({ [USAGE_KEY]: next });
  } catch {
    // A counter we cannot persist is not a reason to refuse the search.
  }

  return next;
}

export async function resetUsage(): Promise<void> {
  await chrome.storage.local.remove(USAGE_KEY).catch(() => {});
}

type CacheMap = Record<string, CachedSearch<unknown>>;

async function readCache(): Promise<CacheMap> {
  try {
    const stored = await chrome.storage.local.get(CACHE_KEY);
    const cache = stored?.[CACHE_KEY];
    return typeof cache === "object" && cache !== null ? (cache as CacheMap) : {};
  } catch {
    return {};
  }
}

export async function readCachedSearch<T>(
  key: string,
  now: number = Date.now()
): Promise<T | null> {
  const cache = await readCache();
  const entry = cache[key];

  if (!entry || typeof entry.storedAt !== "number") return null;
  if (now - entry.storedAt > CACHE_TTL_MS) return null;

  return entry.value as T;
}

export async function writeCachedSearch<T>(
  key: string,
  value: T,
  now: number = Date.now()
): Promise<void> {
  const cache = await readCache();
  cache[key] = { value, storedAt: now };

  // Evict oldest first when over the cap.
  const entries = Object.entries(cache).sort(
    (a, b) => (b[1]?.storedAt ?? 0) - (a[1]?.storedAt ?? 0)
  );

  const trimmed: CacheMap = {};
  for (const [entryKey, entry] of entries.slice(0, MAX_CACHE_ENTRIES)) {
    trimmed[entryKey] = entry;
  }

  try {
    await chrome.storage.local.set({ [CACHE_KEY]: trimmed });
  } catch {
    // Losing the cache costs quota, not correctness.
  }
}

export async function clearSearchCache(): Promise<void> {
  await chrome.storage.local.remove(CACHE_KEY).catch(() => {});
}
