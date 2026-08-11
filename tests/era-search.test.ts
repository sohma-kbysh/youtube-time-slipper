import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEraSearch } from "../src/background/era-search";
import { YouTubeApiError } from "../src/background/youtube-api";
import { CACHE_TTL_MS, readUsage } from "../src/storage/api-usage";

/** A minimal chrome.storage.local, since quota and cache live there. */
function installStorageStub(): Record<string, unknown> {
  const store: Record<string, unknown> = {};

  (globalThis as Record<string, unknown>)["chrome"] = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store[key] }),
        set: async (items: Record<string, unknown>) => Object.assign(store, items),
        remove: async (key: string) => {
          delete store[key];
        }
      }
    }
  };

  return store;
}

function apiStub(videos: Array<{ videoId: string; title: string; publishedDate: string }>) {
  return {
    searchEra: vi.fn(async () => ({ videos, quotaUnits: 100 })),
    verifyKey: vi.fn(async () => ({ quotaUnits: 1 }))
  };
}

const BASE = {
  apiKey: "AIzaTestKey",
  order: "viewCount" as const,
  start: "2010-01-01",
  end: "2012-08-12",
  limit: 10
};

const RESULTS = [
  { videoId: "AAAAAAAAAAA", title: "one", publishedDate: "2011-01-01" },
  { videoId: "BBBBBBBBBBB", title: "two", publishedDate: "2011-06-06" }
];

beforeEach(() => {
  installStorageStub();
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>)["chrome"];
  vi.useRealTimers();
});

describe("createEraSearch", () => {
  it("returns API results and records the quota spent", async () => {
    const api = apiStub(RESULTS);
    const search = createEraSearch({
      api: api as never,
      hasPermission: async () => true
    });

    const outcome = await search.search(BASE);

    expect(outcome.source).toBe("api");
    expect(outcome.videos).toHaveLength(2);
    expect((await readUsage()).units).toBe(100);
  });

  it("serves a repeated search from cache, spending nothing", async () => {
    const api = apiStub(RESULTS);
    const search = createEraSearch({
      api: api as never,
      hasPermission: async () => true
    });

    await search.search(BASE);
    const second = await search.search(BASE);

    expect(second.source).toBe("cache");
    expect(api.searchEra).toHaveBeenCalledTimes(1);
    // Still one search's worth of quota, not two.
    expect((await readUsage()).units).toBe(100);
  });

  it("does not reuse the cache for a different window", async () => {
    const api = apiStub(RESULTS);
    const search = createEraSearch({
      api: api as never,
      hasPermission: async () => true
    });

    await search.search(BASE);
    await search.search({ ...BASE, end: "2015-01-01" });

    expect(api.searchEra).toHaveBeenCalledTimes(2);
  });

  it("re-searches once the cache has gone stale", async () => {
    vi.useFakeTimers();
    const api = apiStub(RESULTS);
    const search = createEraSearch({
      api: api as never,
      hasPermission: async () => true
    });

    await search.search(BASE);
    vi.setSystemTime(Date.now() + CACHE_TTL_MS + 1000);
    await search.search(BASE);

    expect(api.searchEra).toHaveBeenCalledTimes(2);
  });

  it("excludes videos that are already on the page", async () => {
    const api = apiStub(RESULTS);
    const search = createEraSearch({
      api: api as never,
      hasPermission: async () => true
    });

    const outcome = await search.search({ ...BASE, exclude: ["AAAAAAAAAAA"] });

    expect(outcome.videos.map((video) => video.videoId)).toEqual(["BBBBBBBBBBB"]);
  });

  it("does nothing without a key", async () => {
    const api = apiStub(RESULTS);
    const search = createEraSearch({
      api: api as never,
      hasPermission: async () => true
    });

    const outcome = await search.search({ ...BASE, apiKey: "" });

    expect(outcome.source).toBe("unavailable");
    expect(api.searchEra).not.toHaveBeenCalled();
  });

  it("does not call the API without the host permission", async () => {
    const api = apiStub(RESULTS);
    const search = createEraSearch({
      api: api as never,
      hasPermission: async () => false
    });

    const outcome = await search.search(BASE);

    expect(outcome.errorKind).toBe("no-permission");
    expect(api.searchEra).not.toHaveBeenCalled();
  });

  it("reports the failure kind instead of throwing, so discovery can fall back", async () => {
    const api = {
      searchEra: vi.fn(async () => {
        throw new YouTubeApiError("quota", "quota exceeded", 403);
      }),
      verifyKey: vi.fn()
    };

    const search = createEraSearch({
      api: api as never,
      hasPermission: async () => true
    });

    const outcome = await search.search(BASE);

    expect(outcome.videos).toEqual([]);
    expect(outcome.errorKind).toBe("quota");
    expect(outcome.source).toBe("unavailable");
  });
});
