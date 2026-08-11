import { describe, expect, it } from "vitest";

import {
  MemoryCache,
  NEGATIVE_TTL_MS,
  isUsable,
  type CacheRecord
} from "../src/background/cache";

const NOW = Date.UTC(2026, 7, 12);
const PARSER_VERSION = 1;

function record(patch: Partial<CacheRecord> = {}): CacheRecord {
  return {
    videoId: "AAAAAAAAAAA",
    publishedDate: "2012-08-12",
    source: "youtube-html",
    parserVersion: PARSER_VERSION,
    fetchedAt: NOW,
    ...patch
  };
}

describe("isUsable", () => {
  it("keeps a known date forever — upload dates do not change", () => {
    const ancient = record({ fetchedAt: NOW - NEGATIVE_TTL_MS * 365 });
    expect(isUsable(ancient, PARSER_VERSION, NOW)).toBe(true);
  });

  it("keeps a known date even across parser versions", () => {
    const old = record({ parserVersion: PARSER_VERSION - 1 });
    expect(isUsable(old, PARSER_VERSION, NOW)).toBe(true);
  });

  it("expires an unknown after a day so transient failures are re-tried", () => {
    const fresh = record({ publishedDate: null, fetchedAt: NOW - 1000 });
    expect(isUsable(fresh, PARSER_VERSION, NOW)).toBe(true);

    const stale = record({
      publishedDate: null,
      fetchedAt: NOW - NEGATIVE_TTL_MS - 1
    });
    expect(isUsable(stale, PARSER_VERSION, NOW)).toBe(false);
  });

  it("invalidates unknowns produced by an older parser", () => {
    const old = record({
      publishedDate: null,
      parserVersion: PARSER_VERSION - 1,
      fetchedAt: NOW
    });
    expect(isUsable(old, PARSER_VERSION, NOW)).toBe(false);
  });
});

describe("MemoryCache", () => {
  it("stores and retrieves records by id", async () => {
    const cache = new MemoryCache();
    await cache.put(record());

    const found = await cache.getMany(["AAAAAAAAAAA", "BBBBBBBBBBB"]);
    expect(found.get("AAAAAAAAAAA")?.publishedDate).toBe("2012-08-12");
    expect(found.has("BBBBBBBBBBB")).toBe(false);
  });

  it("clears", async () => {
    const cache = new MemoryCache();
    await cache.put(record());
    await cache.clear();

    expect((await cache.getMany(["AAAAAAAAAAA"])).size).toBe(0);
  });
});
