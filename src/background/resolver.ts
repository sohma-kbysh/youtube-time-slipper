/**
 * Publication-date resolution.
 *
 * This is the piece that makes the extension honest. Rather than guessing a
 * date from "2 years ago", it reads the day YouTube itself publishes in the
 * watch page's machine-readable metadata, so a cutoff anywhere — including the
 * day before a video went up — is exact.
 *
 * The service worker has no DOM, so the extraction is done with a small set of
 * anchored patterns against known metadata fields rather than by parsing HTML.
 * This is not a general HTML parser and must not become one: it looks for
 * `datePublished`/`uploadDate` and takes an ISO date out of them, and anything
 * it does not recognise becomes an unknown, which under the default policy is
 * hidden.
 */

import { calendarDateFromIso } from "../core/date.js";
import { debug, warn } from "../core/log.js";
import type {
  PublicationResolution,
  ResolutionSource,
  VideoId
} from "../core/types.js";
import { isValidVideoId } from "../content/video-id.js";
import { isUsable, type CacheRecord, type PublicationCache } from "./cache.js";
import type { WatchData } from "./discovery.js";
import { FetchQueue } from "./fetch-queue.js";
import { parseWatchPageContent } from "./watch-page.js";

/**
 * Bump whenever the extraction below changes.
 *
 * Cached unknowns record the version that produced them, so raising this makes
 * every video the old parser failed on eligible for another attempt, while
 * successfully resolved dates stay cached.
 */
export const PARSER_VERSION = 2;

export const FETCH_TIMEOUT_MS = 10_000;

const ISO_DATE = String.raw`(\d{4}-\d{2}-\d{2})`;

/**
 * Extraction patterns, most authoritative first.
 *
 * Both attribute orders are covered for the `<meta>` forms because YouTube
 * emits `itemprop` before `content` on the watch page and the reverse in some
 * experiments. The JSON forms are the fallback for layouts that drop the
 * microformat block entirely.
 */
const PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  {
    label: "meta[itemprop=datePublished]",
    pattern: new RegExp(
      String.raw`itemprop=["']datePublished["'][^>]*content=["']${ISO_DATE}`,
      "i"
    )
  },
  {
    label: "meta[content][itemprop=datePublished]",
    pattern: new RegExp(
      String.raw`content=["']${ISO_DATE}[^"']*["'][^>]*itemprop=["']datePublished["']`,
      "i"
    )
  },
  {
    label: "meta[itemprop=uploadDate]",
    pattern: new RegExp(
      String.raw`itemprop=["']uploadDate["'][^>]*content=["']${ISO_DATE}`,
      "i"
    )
  },
  {
    label: "meta[content][itemprop=uploadDate]",
    pattern: new RegExp(
      String.raw`content=["']${ISO_DATE}[^"']*["'][^>]*itemprop=["']uploadDate["']`,
      "i"
    )
  },
  {
    label: "json:publishDate",
    pattern: new RegExp(String.raw`"publishDate"\s*:\s*"${ISO_DATE}`)
  },
  {
    label: "json:uploadDate",
    pattern: new RegExp(String.raw`"uploadDate"\s*:\s*"${ISO_DATE}`)
  }
];

export interface ParsedPublication {
  date: string;
  /** Which pattern matched; recorded for debugging only. */
  label: string;
}

/**
 * Pull a publication date out of a watch page.
 *
 * Pure and synchronous, which is what makes the riskiest part of the extension
 * — the bit coupled to YouTube's markup — testable against fixtures.
 */
export function parsePublicationDate(html: string): ParsedPublication | null {
  if (typeof html !== "string" || html.length === 0) return null;

  for (const { pattern, label } of PATTERNS) {
    const match = pattern.exec(html);
    if (!match) continue;

    const date = calendarDateFromIso(match[1]);
    if (date) return { date, label };
  }

  return null;
}

export interface ResolverDependencies {
  cache: PublicationCache;
  queue?: FetchQueue;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface Resolver {
  resolve(videoId: VideoId, priority?: number): Promise<PublicationResolution>;
  resolveMany(
    videoIds: VideoId[]
  ): Promise<Map<VideoId, PublicationResolution>>;
  /**
   * Everything the discovery walk needs about a video: its date, its title and
   * the videos YouTube considers adjacent to it. Served from cache when the
   * cached record was written by a version that stored related ids.
   */
  getWatchData(videoId: VideoId): Promise<WatchData>;
}

export function createResolver(deps: ResolverDependencies): Resolver {
  const cache = deps.cache;
  const queue = deps.queue ?? new FetchQueue();
  const doFetch = deps.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const now = deps.now ?? Date.now;

  /**
   * Requests currently in flight, keyed by video id.
   *
   * The same video routinely appears in the sidebar, in a shelf and in the
   * search results of one page; without this, each occurrence would trigger its
   * own fetch of the same document.
   */
  const inFlight = new Map<VideoId, Promise<PublicationResolution>>();

  /**
   * Titles and related ids from pages read during this worker's lifetime.
   *
   * The cache is the durable copy; this avoids a second IndexedDB round trip
   * for a page that was just fetched, which is the common case during a walk.
   */
  const lastWatchData = new Map<VideoId, WatchData>();

  function unknownResolution(videoId: VideoId): PublicationResolution {
    return {
      videoId,
      publishedDate: null,
      source: "unknown",
      confidence: "unknown",
      resolvedAt: now()
    };
  }

  function fromRecord(record: CacheRecord): PublicationResolution {
    return {
      videoId: record.videoId,
      publishedDate: record.publishedDate,
      source: "cache",
      confidence: record.publishedDate === null ? "unknown" : "exact-day",
      resolvedAt: record.fetchedAt
    };
  }

  async function fetchHtml(
    videoId: VideoId,
    credentials: RequestCredentials
  ): Promise<string | null> {
    // The worker builds this URL itself. The content script only ever sends an
    // id, and it is validated again here, so a compromised page cannot use the
    // extension as a fetch proxy for an arbitrary URL.
    const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

    const response = await doFetch(url, {
      credentials,
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });

    if (!response.ok) {
      debug(`fetch ${videoId}: HTTP ${response.status}`);
      return null;
    }

    return await response.text();
  }

  async function resolveOverNetwork(
    videoId: VideoId
  ): Promise<PublicationResolution> {
    let source: ResolutionSource = "unknown";
    let date: string | null = null;
    let title: string | null = null;
    let related: VideoId[] = [];

    try {
      // Cookie-less first: reading a public upload date does not need the
      // user's identity attached to the request.
      let html = await fetchHtml(videoId, "omit");
      let parsed = html ? parsePublicationDate(html) : null;

      if (!parsed) {
        // A cookie-less request can land on a consent or sign-in interstitial
        // (notably in the EU), which contains no video metadata at all. Retry
        // once as the signed-in user before giving up, otherwise every video
        // would resolve to unknown and — correctly but uselessly — be hidden.
        html = await fetchHtml(videoId, "include");
        parsed = html ? parsePublicationDate(html) : null;
      }

      if (parsed) {
        date = parsed.date;
        source = "youtube-html";
        debug(`resolved ${videoId} -> ${parsed.date} (${parsed.label})`);
      } else {
        debug(`unresolved ${videoId}: no publication metadata`);
      }

      // The title and the related-video ids come out of the page we already
      // fetched, so discovery costs no extra requests.
      if (html) {
        const content = parseWatchPageContent(html, videoId);
        title = content.title;
        related = content.related;
      }
    } catch (error) {
      // Network failure, timeout, abort: all become unknown, which the policy
      // layer treats as "not proven to be in the past".
      warn(`resolution failed for ${videoId}`, error);
    }

    const record: CacheRecord = {
      videoId,
      publishedDate: date,
      source,
      parserVersion: PARSER_VERSION,
      fetchedAt: now(),
      title,
      related
    };

    lastWatchData.set(videoId, {
      videoId,
      publishedDate: date,
      title,
      related
    });

    try {
      await cache.put(record);
    } catch (error) {
      warn("cache write failed", error);
    }

    return {
      videoId,
      publishedDate: date,
      source,
      confidence: date === null ? "unknown" : "exact-day",
      resolvedAt: record.fetchedAt
    };
  }

  function startResolution(
    videoId: VideoId,
    priority: number
  ): Promise<PublicationResolution> {
    const existing = inFlight.get(videoId);
    if (existing) return existing;

    const promise = queue
      .run(() => resolveOverNetwork(videoId), priority)
      .catch(() => unknownResolution(videoId))
      .finally(() => {
        inFlight.delete(videoId);
      });

    inFlight.set(videoId, promise);
    return promise;
  }

  async function resolve(
    videoId: VideoId,
    priority = 0
  ): Promise<PublicationResolution> {
    if (!isValidVideoId(videoId)) return unknownResolution(videoId);

    const cached = await cache.getMany([videoId]).catch(() => new Map());
    const record = cached.get(videoId);
    if (record && isUsable(record, PARSER_VERSION, now())) {
      return fromRecord(record);
    }

    return startResolution(videoId, priority);
  }

  async function resolveMany(
    videoIds: VideoId[]
  ): Promise<Map<VideoId, PublicationResolution>> {
    const results = new Map<VideoId, PublicationResolution>();

    const valid = [...new Set(videoIds)].filter(isValidVideoId);
    if (valid.length === 0) return results;

    // One transaction for the whole batch — the common case after the first
    // visit to a feed is that every id is a cache hit and nothing is fetched.
    const cached = await cache.getMany(valid).catch((error) => {
      warn("cache read failed", error);
      return new Map<VideoId, CacheRecord>();
    });

    const timestamp = now();
    const toFetch: VideoId[] = [];

    for (const videoId of valid) {
      const record = cached.get(videoId);
      if (record && isUsable(record, PARSER_VERSION, timestamp)) {
        results.set(videoId, fromRecord(record));
      } else {
        toFetch.push(videoId);
      }
    }

    debug(`resolveMany: ${valid.length} ids, ${toFetch.length} need fetching`);

    // Priority descends with position so the ids the content script listed
    // first — the ones nearest the top of the page — come back first.
    const settled = await Promise.all(
      toFetch.map((videoId, index) => startResolution(videoId, -index))
    );

    for (const resolution of settled) {
      results.set(resolution.videoId, resolution);
    }

    return results;
  }

  /**
   * Resolve a video *with* its related ids.
   *
   * A cached record from before related-id extraction has `related` undefined;
   * that is treated as a miss so the walk can proceed, while a record with an
   * empty array is taken at face value.
   */
  async function getWatchData(videoId: VideoId): Promise<WatchData> {
    const empty: WatchData = {
      videoId,
      publishedDate: null,
      title: null,
      related: []
    };

    if (!isValidVideoId(videoId)) return empty;

    const remembered = lastWatchData.get(videoId);
    if (remembered) return remembered;

    const cached = await cache.getMany([videoId]).catch(() => new Map());
    const record = cached.get(videoId) as CacheRecord | undefined;

    if (record?.related !== undefined && isUsable(record, PARSER_VERSION, now())) {
      const data: WatchData = {
        videoId,
        publishedDate: record.publishedDate,
        title: record.title ?? null,
        related: record.related
      };
      lastWatchData.set(videoId, data);
      return data;
    }

    await startResolution(videoId, -50);
    return lastWatchData.get(videoId) ?? empty;
  }

  return { resolve, resolveMany, getWatchData };
}
