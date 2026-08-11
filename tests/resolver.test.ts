import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { MemoryCache, isUsable, type CacheRecord } from "../src/background/cache";
import { FetchQueue } from "../src/background/fetch-queue";
import {
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
