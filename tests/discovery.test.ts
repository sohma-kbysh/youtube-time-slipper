import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  MAX_DEPTH,
  createDiscovery,
  type WatchData
} from "../src/background/discovery";
import {
  parseRelatedIds,
  parseTitle,
  parseWatchPageContent
} from "../src/background/watch-page";

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

describe("parseWatchPageContent", () => {
  const html = fixture("watch-related.html");

  it("reads the related video ids in YouTube's order", () => {
    expect(parseRelatedIds(html)).toEqual([
      "AAAAAAAAAAA",
      "BBBBBBBBBBB",
      "CCCCCCCCCCC"
    ]);
  });

  it("reads ids from both the old renderer and the newer lockup shape", () => {
    expect(parseRelatedIds(html)).toContain("CCCCCCCCCCC");
  });

  it("excludes the video itself and duplicates", () => {
    const ids = parseRelatedIds(html, "AAAAAAAAAAA");
    expect(ids).not.toContain("AAAAAAAAAAA");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reads the title, unescaped", () => {
    expect(parseTitle(html)).toBe("Seed video & friends");
  });

  it("survives a page with nothing in it", () => {
    expect(parseWatchPageContent("")).toEqual({ title: null, related: [] });
    expect(parseWatchPageContent("<html></html>").related).toEqual([]);
  });

  it("ignores malformed ids", () => {
    expect(parseRelatedIds('{"videoId":"tooshort"}')).toEqual([]);
  });
});

/** A tiny fake YouTube: a graph of videos with dates. */
function graph(entries: Record<string, { date: string | null; related: string[] }>) {
  const getWatchData = vi.fn(async (videoId: string): Promise<WatchData> => {
    const entry = entries[videoId];
    if (!entry) return { videoId, publishedDate: null, title: null, related: [] };

    return {
      videoId,
      publishedDate: entry.date,
      title: `title ${videoId}`,
      related: entry.related
    };
  });

  // Deterministic "random": no shuffling, no rotation.
  return { getWatchData, discovery: createDiscovery({ getWatchData, random: () => 0 }) };
}

describe("createDiscovery", () => {
  it("finds in-window neighbours of a seed", async () => {
    const { discovery } = graph({
      seed: { date: "2011-01-01", related: ["old", "new"] },
      old: { date: "2010-06-06", related: [] },
      new: { date: "2024-01-01", related: [] }
    });

    const found = await discovery.discover({
      seeds: ["seed"],
      start: null,
      end: "2012-08-12",
      limit: 10
    });

    expect(found.map((video) => video.videoId)).toEqual(["old"]);
    expect(found[0]?.publishedDate).toBe("2010-06-06");
    expect(found[0]?.title).toBe("title old");
  });

  it("respects the lower bound of the window", async () => {
    const { discovery } = graph({
      seed: { date: "2011-01-01", related: ["ancient", "inside"] },
      ancient: { date: "2006-01-01", related: [] },
      inside: { date: "2010-06-06", related: [] }
    });

    const found = await discovery.discover({
      seeds: ["seed"],
      start: "2010-01-01",
      end: "2012-08-12",
      limit: 10
    });

    expect(found.map((video) => video.videoId)).toEqual(["inside"]);
  });

  it("walks outward: a neighbour's neighbour is also found", async () => {
    const { discovery } = graph({
      seed: { date: "2011-01-01", related: ["one"] },
      one: { date: "2011-02-02", related: ["two"] },
      two: { date: "2011-03-03", related: [] }
    });

    const found = await discovery.discover({
      seeds: ["seed"],
      start: null,
      end: "2012-08-12",
      limit: 10
    });

    expect(found.map((video) => video.videoId)).toEqual(["one", "two"]);
    expect(found[1]?.depth).toBe(2);
  });

  it("does not travel through out-of-window videos", async () => {
    // The only route to `hidden-gem` is via a 2024 video, which is not part of
    // this timeline and so is not a place to walk from.
    const { discovery } = graph({
      seed: { date: "2011-01-01", related: ["modern"] },
      modern: { date: "2024-01-01", related: ["hidden-gem"] },
      "hidden-gem": { date: "2011-05-05", related: [] }
    });

    const found = await discovery.discover({
      seeds: ["seed"],
      start: null,
      end: "2012-08-12",
      limit: 10
    });

    expect(found).toEqual([]);
  });

  it("never returns a video that is already on the page", async () => {
    const { discovery } = graph({
      seed: { date: "2011-01-01", related: ["known", "fresh"] },
      known: { date: "2010-01-01", related: [] },
      fresh: { date: "2010-02-02", related: [] }
    });

    const found = await discovery.discover({
      seeds: ["seed"],
      start: null,
      end: "2012-08-12",
      limit: 10,
      exclude: ["known"]
    });

    expect(found.map((video) => video.videoId)).toEqual(["fresh"]);
  });

  it("stops at the limit", async () => {
    const related = Array.from({ length: 30 }, (_, index) => `v${index}`);
    const entries: Record<string, { date: string; related: string[] }> = {
      seed: { date: "2011-01-01", related }
    };
    for (const id of related) entries[id] = { date: "2011-06-06", related: [] };

    const { discovery } = graph(entries);

    const found = await discovery.discover({
      seeds: ["seed"],
      start: null,
      end: "2012-08-12",
      limit: 5
    });

    expect(found).toHaveLength(5);
  });

  it("respects the fetch budget so a walk cannot run away", async () => {
    const related = Array.from({ length: 50 }, (_, index) => `v${index}`);
    const entries: Record<string, { date: string; related: string[] }> = {
      seed: { date: "2011-01-01", related }
    };
    for (const id of related) entries[id] = { date: "2024-01-01", related: [] };

    const { discovery, getWatchData } = graph(entries);

    await discovery.discover({
      seeds: ["seed"],
      start: null,
      end: "2012-08-12",
      limit: 20,
      fetchBudget: 10
    });

    expect(getWatchData.mock.calls.length).toBeLessThanOrEqual(11);
  });

  it("does not loop forever on a cyclic graph", async () => {
    const { discovery, getWatchData } = graph({
      a: { date: "2011-01-01", related: ["b"] },
      b: { date: "2011-02-02", related: ["a", "c"] },
      c: { date: "2011-03-03", related: ["a", "b"] }
    });

    const found = await discovery.discover({
      seeds: ["a"],
      start: null,
      end: "2012-08-12",
      limit: 20
    });

    expect(found.map((video) => video.videoId).sort()).toEqual(["b", "c"]);
    expect(getWatchData.mock.calls.length).toBeLessThan(20);
  });

  it("survives a page that cannot be read", async () => {
    const getWatchData = vi.fn(async (videoId: string): Promise<WatchData> => {
      if (videoId === "broken") throw new Error("network");
      if (videoId === "seed") {
        return {
          videoId,
          publishedDate: "2011-01-01",
          title: null,
          related: ["broken", "good"]
        };
      }
      return {
        videoId,
        publishedDate: "2011-04-04",
        title: "good one",
        related: []
      };
    });

    const discovery = createDiscovery({ getWatchData, random: () => 0 });

    const found = await discovery.discover({
      seeds: ["seed"],
      start: null,
      end: "2012-08-12",
      limit: 10
    });

    expect(found.map((video) => video.videoId)).toEqual(["good"]);
  });

  it("returns nothing when given no seeds", async () => {
    const { discovery } = graph({});
    expect(
      await discovery.discover({ seeds: [], start: null, end: "2012-08-12", limit: 5 })
    ).toEqual([]);
  });

  it("does not walk deeper than the depth limit", async () => {
    // A chain longer than MAX_DEPTH: the far end must not be reached.
    const entries: Record<string, { date: string; related: string[] }> = {};
    const chain = ["seed", "d1", "d2", "d3", "d4", "d5"];
    chain.forEach((id, index) => {
      entries[id] = {
        date: "2011-01-01",
        related: chain[index + 1] ? [chain[index + 1] as string] : []
      };
    });

    const { discovery } = graph(entries);

    const found = await discovery.discover({
      seeds: ["seed"],
      start: null,
      end: "2012-08-12",
      limit: 50
    });

    expect(found).toHaveLength(MAX_DEPTH);
    expect(found.map((video) => video.videoId)).not.toContain("d5");
  });
});
