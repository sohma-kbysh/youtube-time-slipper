import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { MemoryCache, isUsable, type CacheRecord } from "../src/background/cache";
import { FetchQueue } from "../src/background/fetch-queue";
import {
  HTML_CIRCUIT_BREAKER_MS,
  PARSER_VERSION,
  createResolver,
  parsePublicationDate
} from "../src/background/resolver";

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

const ID = "dQw4w9WgXcQ";
const OTHER_ID = "AAAAAAAAAAA";

describe("parsePublicationDate", () => {
  it("reads meta[itemprop=datePublished]", () => {
    expect(parsePublicationDate(fixture("watch-meta.html"))?.date).toBe("2014-05-01");
  });

  it("reads the reversed attribute order and an ISO timestamp", () => {
    expect(parsePublicationDate(fixture("watch-reversed.html"))?.date).toBe(
      "2009-10-25"
    );
  });

  it("falls back to the embedded player JSON", () => {
    const parsed = parsePublicationDate(fixture("watch-json.html"));
    expect(parsed?.date).toBe("2018-01-02");
    expect(parsed?.label).toBe("json:publishDate");
  });

  it("prefers datePublished over uploadDate when both are present", () => {
    const html =
      '<meta itemprop="uploadDate" content="2020-01-01">' +
      '<meta itemprop="datePublished" content="2019-06-06">';
    expect(parsePublicationDate(html)?.date).toBe("2019-06-06");
  });

  it("returns null for a page with no publication metadata", () => {
    expect(parsePublicationDate(fixture("watch-none.html"))).toBeNull();
  });

  it("does not invent a date from a relative timestamp", () => {
    // The consent-wall fixture contains the words "2 years ago"; a parser that
    // fell back to relative text would produce a confident wrong answer.
    expect(parsePublicationDate("<p>2 years ago</p>")).toBeNull();
  });

  it("rejects an impossible date found in metadata", () => {
    expect(
      parsePublicationDate('<meta itemprop="datePublished" content="2014-02-30">')
    ).toBeNull();
  });

  it("handles empty and non-string input", () => {
    expect(parsePublicationDate("")).toBeNull();
    expect(parsePublicationDate(undefined as unknown as string)).toBeNull();
  });
});

function okResponse(body: string): Response {
  return new Response(body, { status: 200 });
}

describe("createResolver", () => {
  it("resolves 50 cache misses with one Data API call and no watch-page fetch", async () => {
    const ids = Array.from({ length: 50 }, (_, index) =>
      `A${String(index).padStart(10, "0")}`
    );
    const listVideoMetadata = vi.fn(async (_key: string, batch: string[]) =>
      new Map(batch.map((videoId) => [videoId, {
        videoId,
        publishedDate: "2012-08-12",
        title: `title ${videoId}`,
        channelTitle: "channel"
      }]))
    );
    const fetchImpl = vi.fn();
    const resolver = createResolver({
      cache: new MemoryCache(),
      fetchImpl: fetchImpl as never,
      getApiKey: async () => "AIzaTestKey",
      listVideoMetadata
    });

    const results = await resolver.resolveMany(ids);

    expect(results.size).toBe(50);
    expect(listVideoMetadata).toHaveBeenCalledOnce();
    expect(listVideoMetadata.mock.calls[0]?.[1]).toHaveLength(50);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(results.get(ids[0]!)?.source).toBe("youtube-api");
  });

  it("splits 120 cache misses into exactly three Data API calls", async () => {
    const ids = Array.from({ length: 120 }, (_, index) =>
      `B${String(index).padStart(10, "0")}`
    );
    const listVideoMetadata = vi.fn(async (_key: string, batch: string[]) =>
      new Map(batch.map((videoId) => [videoId, {
        videoId,
        publishedDate: "2012-08-12",
        title: videoId,
        channelTitle: "channel"
      }]))
    );
    const resolver = createResolver({
      cache: new MemoryCache(),
      getApiKey: async () => "AIzaTestKey",
      listVideoMetadata
    });

    await resolver.resolveMany(ids);

    expect(listVideoMetadata).toHaveBeenCalledTimes(3);
    expect(listVideoMetadata.mock.calls.map((call) => call[1].length)).toEqual([50, 50, 20]);
  });

  it("caches API dates so a subsequent resolution performs no network calls", async () => {
    const cache = new MemoryCache();
    const listVideoMetadata = vi.fn(async () => new Map([[ID, {
      videoId: ID,
      publishedDate: "2014-05-01",
      title: "title",
      channelTitle: "channel"
    }]]));
    const resolver = createResolver({
      cache,
      getApiKey: async () => "AIzaTestKey",
      listVideoMetadata
    });

    expect((await resolver.resolve(ID)).source).toBe("youtube-api");
    expect((await resolver.resolve(ID)).source).toBe("cache");
    expect(listVideoMetadata).toHaveBeenCalledOnce();
  });

  it("treats a missing API item as unknown without scraping its watch page", async () => {
    const fetchImpl = vi.fn();
    const resolver = createResolver({
      cache: new MemoryCache(),
      fetchImpl: fetchImpl as never,
      getApiKey: async () => "AIzaTestKey",
      listVideoMetadata: vi.fn(async () => new Map())
    });

    const result = await resolver.resolve(ID);

    expect(result.publishedDate).toBeNull();
    expect(result.source).toBe("unknown");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not fall back to HTML when a configured API request fails", async () => {
    const fetchImpl = vi.fn();
    const resolver = createResolver({
      cache: new MemoryCache(),
      fetchImpl: fetchImpl as never,
      getApiKey: async () => "AIzaTestKey",
      listVideoMetadata: vi.fn(async () => {
        throw new Error("API unavailable");
      })
    });

    expect((await resolver.resolve(ID)).publishedDate).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resolves a video from its watch page and caches the result", async () => {
    const cache = new MemoryCache();
    const fetchImpl = vi.fn(async () => okResponse(fixture("watch-meta.html")));

    const resolver = createResolver({ cache, fetchImpl: fetchImpl as never });

    const first = await resolver.resolve(ID);
    expect(first.publishedDate).toBe("2014-05-01");
    expect(first.source).toBe("youtube-html");
    expect(first.confidence).toBe("exact-day");

    const second = await resolver.resolve(ID);
    expect(second.publishedDate).toBe("2014-05-01");
    expect(second.source).toBe("cache");

    // The second lookup was served from cache: still one network request.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fetches the canonical watch URL and nothing else", async () => {
    const cache = new MemoryCache();
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(String(url));
      return okResponse(fixture("watch-meta.html"));
    });

    const resolver = createResolver({ cache, fetchImpl: fetchImpl as never });
    await resolver.resolve(ID);

    expect(urls).toEqual([`https://www.youtube.com/watch?v=${ID}`]);
  });

  it("never fetches for a malformed id", async () => {
    const cache = new MemoryCache();
    const fetchImpl = vi.fn(async () => okResponse(fixture("watch-meta.html")));

    const resolver = createResolver({ cache, fetchImpl: fetchImpl as never });

    const result = await resolver.resolve("../../etc/passwd");
    expect(result.publishedDate).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("de-duplicates concurrent requests for the same video", async () => {
    const cache = new MemoryCache();
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return okResponse(fixture("watch-meta.html"));
    });

    const resolver = createResolver({ cache, fetchImpl: fetchImpl as never });

    const results = await Promise.all([
      resolver.resolve(ID),
      resolver.resolve(ID),
      resolver.resolve(ID)
    ]);

    expect(results.map((r) => r.publishedDate)).toEqual([
      "2014-05-01",
      "2014-05-01",
      "2014-05-01"
    ]);
    expect(calls).toBe(1);
  });

  it("resolves a batch, mixing cache hits and fetches", async () => {
    const cache = new MemoryCache();
    await cache.put({
      videoId: OTHER_ID,
      publishedDate: "2007-03-03",
      source: "youtube-html",
      parserVersion: PARSER_VERSION,
      fetchedAt: Date.now()
    });

    const fetchImpl = vi.fn(async () => okResponse(fixture("watch-meta.html")));
    const resolver = createResolver({ cache, fetchImpl: fetchImpl as never });

    const results = await resolver.resolveMany([ID, OTHER_ID, ID, "bad"]);

    expect(results.get(ID)?.publishedDate).toBe("2014-05-01");
    expect(results.get(OTHER_ID)?.publishedDate).toBe("2007-03-03");
    expect(results.has("bad")).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reports unknown — not a date — when the page has no metadata", async () => {
    const cache = new MemoryCache();
    const fetchImpl = vi.fn(async () => okResponse(fixture("watch-none.html")));

    const resolver = createResolver({ cache, fetchImpl: fetchImpl as never });
    const result = await resolver.resolve(ID);

    expect(result.publishedDate).toBeNull();
    expect(result.confidence).toBe("unknown");
    // One cookie-less attempt plus the signed-in retry for consent walls.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries with credentials when the first response is unparseable", async () => {
    const cache = new MemoryCache();
    const credentials: Array<string | undefined> = [];

    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      credentials.push(init?.credentials);
      return okResponse(
        credentials.length === 1 ? fixture("watch-none.html") : fixture("watch-meta.html")
      );
    });

    const resolver = createResolver({ cache, fetchImpl: fetchImpl as never });
    const result = await resolver.resolve(ID);

    expect(credentials).toEqual(["omit", "include"]);
    expect(result.publishedDate).toBe("2014-05-01");
  });

  it("opens a circuit on google.com/sorry and does not retry with credentials", async () => {
    const response = new Response("challenge", { status: 200 });
    Object.defineProperty(response, "url", {
      value: "https://www.google.com/sorry/index?continue=youtube",
      configurable: true
    });
    let clock = 1_000;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(okResponse(fixture("watch-meta.html")));
    const resolver = createResolver({
      cache: new MemoryCache(),
      queue: new FetchQueue(2),
      fetchImpl: fetchImpl as never,
      now: () => clock
    });

    const first = await resolver.resolveManyDetailed([ID]);
    const second = await resolver.resolveManyDetailed([OTHER_ID]);

    expect(first.status).toBe("html-rate-limited");
    expect(second.status).toBe("html-rate-limited");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[1]?.credentials).toBe("omit");

    clock += HTML_CIRCUIT_BREAKER_MS;
    const afterCooldown = await resolver.resolve("ZZZZZZZZZZZ");
    expect(afterCooldown.publishedDate).toBe("2014-05-01");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("opens the HTML circuit on HTTP 429", async () => {
    const fetchImpl = vi.fn(async () => new Response("slow down", { status: 429 }));
    const resolver = createResolver({
      cache: new MemoryCache(),
      queue: new FetchQueue(1),
      fetchImpl: fetchImpl as never
    });

    const result = await resolver.resolveManyDetailed([ID, OTHER_ID]);

    expect(result.status).toBe("html-rate-limited");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reports unknown when the network fails, and does not throw", async () => {
    const cache = new MemoryCache();
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });

    const resolver = createResolver({ cache, fetchImpl: fetchImpl as never });
    const result = await resolver.resolve(ID);

    expect(result.publishedDate).toBeNull();
    expect(result.source).toBe("unknown");
  });

  it("reports unknown for an HTTP error", async () => {
    const cache = new MemoryCache();
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 404 }));

    const resolver = createResolver({ cache, fetchImpl: fetchImpl as never });
    expect((await resolver.resolve(ID)).publishedDate).toBeNull();
  });

  it("re-tries a cached unknown once the parser version moves on", async () => {
    const stale: CacheRecord = {
      videoId: ID,
      publishedDate: null,
      source: "unknown",
      parserVersion: PARSER_VERSION - 1,
      fetchedAt: Date.now()
    };

    expect(isUsable(stale, PARSER_VERSION)).toBe(false);

    const cache = new MemoryCache();
    await cache.put(stale);

    const fetchImpl = vi.fn(async () => okResponse(fixture("watch-meta.html")));
    const resolver = createResolver({
      cache,
      queue: new FetchQueue(2),
      fetchImpl: fetchImpl as never
    });

    expect((await resolver.resolve(ID)).publishedDate).toBe("2014-05-01");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
