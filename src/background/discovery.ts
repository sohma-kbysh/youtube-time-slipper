/**
 * Finding videos from the era that the user has not already been shown.
 *
 * Filtering the home feed can only ever return a subset of what YouTube
 * already decided to recommend today — which is personalised, so the subset is
 * whatever the user habitually watches. That is why a filtered feed feels both
 * empty and repetitive at the same time.
 *
 * This walks YouTube's related-video graph instead. Starting from videos that
 * are already inside the window, it asks each one "what is adjacent to this?",
 * keeps the answers that also fall inside the window, and uses those as the
 * next set of starting points. It is a breadth-first search over the
 * recommender's own notion of similarity, constrained to a period.
 *
 * Two properties make this worth doing:
 *
 *  - The pages are fetched without cookies, so the related lists are the
 *    generic ones rather than this user's. The results are adjacent to the
 *    *videos*, not to the viewer's history.
 *  - One step out from a familiar video is where the unfamiliar lives. Two or
 *    three steps out, in a fixed period, is a different corner of YouTube.
 *
 * It cannot reconstruct what was trending in 2012 — nothing client-side can.
 * It finds what YouTube today considers close to the era's videos.
 */

import { compareCalendarDates } from "../core/date.js";
import { debug } from "../core/log.js";
import type { CalendarDate, VideoId } from "../core/types.js";

/** Watch pages fetched per request. Each is one HTTP round trip when uncached. */
export const DEFAULT_FETCH_BUDGET = 60;

/** How far from the seeds the walk may travel. */
export const MAX_DEPTH = 3;

export interface DiscoveredVideo {
  videoId: VideoId;
  title: string | null;
  publishedDate: CalendarDate;
  /** How many related-video steps from a seed. Useful for ordering. */
  depth: number;
}

export interface DiscoveryRequest {
  /** Videos known to be inside the window, used as starting points. */
  seeds: VideoId[];
  /** Inclusive window. `start` of `null` means no lower bound. */
  start: CalendarDate | null;
  end: CalendarDate;
  /** How many videos to return. */
  limit: number;
  /** Videos already on the page, which would not be a discovery. */
  exclude?: VideoId[];
  fetchBudget?: number;
}

/** What discovery needs from the resolver, kept narrow so it can be faked. */
export interface WatchData {
  videoId: VideoId;
  publishedDate: CalendarDate | null;
  title: string | null;
  related: VideoId[];
}

export interface DiscoveryDependencies {
  getWatchData(videoId: VideoId): Promise<WatchData>;
  /** Injected for deterministic tests; defaults to Math.random. */
  random?: () => number;
}

export function createDiscovery(deps: DiscoveryDependencies) {
  const random = deps.random ?? Math.random;

  function inWindow(
    date: CalendarDate,
    start: CalendarDate | null,
    end: CalendarDate
  ): boolean {
    if (compareCalendarDates(date, end) > 0) return false;
    if (start && compareCalendarDates(date, start) < 0) return false;
    return true;
  }

  async function discover(request: DiscoveryRequest): Promise<DiscoveredVideo[]> {
    const budget = request.fetchBudget ?? DEFAULT_FETCH_BUDGET;
    const excluded = new Set(request.exclude ?? []);

    const visited = new Set<VideoId>([...excluded, ...request.seeds]);
    const found: DiscoveredVideo[] = [];

    let frontier: VideoId[] = shuffle(request.seeds, random);
    let fetches = 0;

    for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
      if (frontier.length === 0) break;

      const next: VideoId[] = [];

      for (const videoId of frontier) {
        if (found.length >= request.limit || fetches >= budget) break;

        let page: WatchData;
        try {
          page = await deps.getWatchData(videoId);
          fetches += 1;
        } catch {
          // A page we cannot read is a dead end, not a failure of the walk.
          continue;
        }

        // Take the neighbours in YouTube's own order, which is its ranking,
        // but start from a random offset so repeated runs on the same page do
        // not keep surfacing the same first few.
        for (const candidate of rotate(page.related, random)) {
          if (found.length >= request.limit || fetches >= budget) break;
          if (visited.has(candidate)) continue;

          visited.add(candidate);

          let candidatePage: WatchData;
          try {
            candidatePage = await deps.getWatchData(candidate);
            fetches += 1;
          } catch {
            continue;
          }

          const date = candidatePage.publishedDate;
          if (date === null) continue;

          if (inWindow(date, request.start, request.end)) {
            found.push({
              videoId: candidate,
              title: candidatePage.title,
              publishedDate: date,
              depth: depth + 1
            });

            // Only videos inside the window become starting points, so the
            // walk stays in the era instead of drifting into the present.
            next.push(candidate);
          }
        }
      }

      frontier = next;
    }

    debug(
      `discovery: ${found.length} videos from ${request.seeds.length} seeds, ` +
        `${fetches} pages read`
    );

    return found.slice(0, request.limit);
  }

  return { discover };
}

/** Fisher-Yates, so seed order does not decide what gets explored first. */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap] as T, copy[index] as T];
  }
  return copy;
}

/** Keep the ranking but vary the entry point. */
function rotate<T>(items: readonly T[], random: () => number): T[] {
  if (items.length <= 1) return [...items];
  const offset = Math.floor(random() * items.length);
  return [...items.slice(offset), ...items.slice(0, offset)];
}
