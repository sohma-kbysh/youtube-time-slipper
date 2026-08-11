import { describe, expect, it, vi } from "vitest";

import {
  DAILY_QUOTA,
  QUOTA_SEARCH,
  YouTubeApiError,
  createYouTubeApi,
  searchCacheKey
} from "../src/background/youtube-api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function searchBody(
  items: Array<{ id: string; title: string; publishedAt: string }>
): unknown {
  return {
    items: items.map((item) => ({
      id: { videoId: item.id },
      snippet: { title: item.title, publishedAt: item.publishedAt }
    }))
  };
}

const KEY = "AIzaTestKey";

describe("searchEra", () => {
  it("asks for the window, inclusive of its last day", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(String(url));
      return jsonResponse(searchBody([]));
    });

    const api = createYouTubeApi({ fetchImpl: fetchImpl as never });
    await api.searchEra({
      apiKey: KEY,
      after: "2011-06-01",
      before: "2012-08-12",
      order: "viewCount"
    });

    const url = new URL(urls[0]!);
    expect(url.origin).toBe("https://www.googleapis.com");
    expect(url.pathname).toBe("/youtube/v3/search");
    expect(url.searchParams.get("publishedAfter")).toBe("2011-05-31T23:59:59.999Z");
    // The API boundaries are strict, so the next midnight includes the entire
    // cutoff day, including a video at 23:59:59.999.
    expect(url.searchParams.get("publishedBefore")).toBe("2012-08-13T00:00:00.000Z");
    expect(url.searchParams.get("order")).toBe("viewCount");
    expect(url.searchParams.get("type")).toBe("video");
    expect(url.searchParams.get("key")).toBe(KEY);
  });

  it("omits the lower bound when there is none", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(String(url));
      return jsonResponse(searchBody([]));
    });

    const api = createYouTubeApi({ fetchImpl: fetchImpl as never });
    await api.searchEra({
      apiKey: KEY,
      after: null,
      before: "2012-08-12",
      order: "viewCount"
    });

    expect(new URL(urls[0]!).searchParams.has("publishedAfter")).toBe(false);
  });

  it("passes the query and channel through", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(String(url));
      return jsonResponse(searchBody([]));
    });

    const api = createYouTubeApi({ fetchImpl: fetchImpl as never });
    await api.searchEra({
      apiKey: KEY,
      query: "ゲーム実況",
      channelId: "UCabcdefghijklmnopqrstuv",
      after: null,
      before: "2012-08-12",
      order: "relevance"
    });

    const params = new URL(urls[0]!).searchParams;
    expect(params.get("q")).toBe("ゲーム実況");
    expect(params.get("channelId")).toBe("UCabcdefghijklmnopqrstuv");
  });

  it("passes a continuation token and returns the next one", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(String(url));
      return jsonResponse({ items: [], nextPageToken: "page-3" });
    });

    const api = createYouTubeApi({ fetchImpl: fetchImpl as never });
    const result = await api.searchEra({
      apiKey: KEY,
      after: null,
      before: "2012-08-12",
      order: "viewCount",
      pageToken: "page-2",
      maxResults: 50
    });

    expect(new URL(urls[0]!).searchParams.get("pageToken")).toBe("page-2");
    expect(new URL(urls[0]!).searchParams.get("maxResults")).toBe("50");
    expect(result.nextPageToken).toBe("page-3");
  });

  it("never sends the user's cookies with the key", async () => {
    const inits: RequestInit[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init) inits.push(init);
      return jsonResponse(searchBody([]));
    });

    const api = createYouTubeApi({ fetchImpl: fetchImpl as never });
    await api.searchEra({
      apiKey: KEY,
      after: null,
      before: "2012-08-12",
      order: "viewCount"
    });

    expect(inits[0]?.credentials).toBe("omit");
  });

  it("parses results into calendar dates", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        searchBody([
          {
            id: "AAAAAAAAAAA",
            title: "Rick &amp; friends",
            publishedAt: "2011-09-08T12:34:56Z"
          }
        ])
      )
    );

    const api = createYouTubeApi({ fetchImpl: fetchImpl as never });
    const result = await api.searchEra({
      apiKey: KEY,
      after: null,
      before: "2012-08-12",
      order: "viewCount"
    });

    expect(result.videos).toEqual([
      {
        videoId: "AAAAAAAAAAA",
        title: "Rick & friends",
        publishedDate: "2011-09-08"
      }
    ]);
    expect(result.quotaUnits).toBe(QUOTA_SEARCH);
  });

  it("keeps the channel title without fabricating view counts", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        items: [{
          id: { videoId: "AAAAAAAAAAA" },
          snippet: {
            title: "A video",
            publishedAt: "2011-09-08T12:34:56Z",
            channelTitle: "Archive Channel"
          }
        }]
      })
    );

    const api = createYouTubeApi({ fetchImpl: fetchImpl as never });
    const result = await api.searchEra({
      apiKey: KEY,
      after: null,
      before: "2012-08-12",
      order: "viewCount"
    });

    expect(result.videos[0]).toMatchObject({ channelTitle: "Archive Channel" });
    expect(result.videos[0]).not.toHaveProperty("viewCount");
  });

  it("drops any result outside the window, whatever the API says", async () => {
    // Defence in depth: the invariant does not get to depend on the API
    // honouring its own filter parameters.
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        searchBody([
          { id: "AAAAAAAAAAA", title: "in", publishedAt: "2011-01-01T00:00:00Z" },
          { id: "BBBBBBBBBBB", title: "too new", publishedAt: "2019-01-01T00:00:00Z" },
          { id: "CCCCCCCCCCC", title: "too old", publishedAt: "2007-01-01T00:00:00Z" }
        ])
      )
    );

    const api = createYouTubeApi({ fetchImpl: fetchImpl as never });
    const result = await api.searchEra({
      apiKey: KEY,
      after: "2010-01-01",
      before: "2012-08-12",
      order: "viewCount"
    });

    expect(result.videos.map((video) => video.videoId)).toEqual(["AAAAAAAAAAA"]);
  });

  it("skips malformed items rather than failing the search", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        items: [
          { id: {}, snippet: { title: "no id", publishedAt: "2011-01-01T00:00:00Z" } },
          { id: { videoId: "AAAAAAAAAAA" }, snippet: { title: "no date" } },
          {
            id: { videoId: "BBBBBBBBBBB" },
            snippet: { title: "fine", publishedAt: "2011-02-02T00:00:00Z" }
          }
        ]
      })
    );

    const api = createYouTubeApi({ fetchImpl: fetchImpl as never });
    const result = await api.searchEra({
      apiKey: KEY,
      after: null,
      before: "2012-08-12",
      order: "viewCount"
    });

    expect(result.videos.map((video) => video.videoId)).toEqual(["BBBBBBBBBBB"]);
  });
});

describe("verifyKey", () => {
  it("uses a one-unit call rather than spending a search", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(String(url));
      return jsonResponse({ items: [{ id: "dQw4w9WgXcQ" }] });
    });

    const api = createYouTubeApi({ fetchImpl: fetchImpl as never });
    const result = await api.verifyKey(KEY);

    expect(new URL(urls[0]!).pathname).toBe("/youtube/v3/videos");
    expect(result.quotaUnits).toBe(1);
  });

  it("rejects an empty key without a request", async () => {
    const fetchImpl = vi.fn();
    const api = createYouTubeApi({ fetchImpl: fetchImpl as never });

    await expect(api.verifyKey("   ")).rejects.toThrow(YouTubeApiError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("error mapping", () => {
  async function failWith(status: number, body: unknown): Promise<YouTubeApiError> {
    const api = createYouTubeApi({
      fetchImpl: (async () => jsonResponse(body, status)) as never
    });

    try {
      await api.verifyKey(KEY);
      throw new Error("expected a failure");
    } catch (error) {
      return error as YouTubeApiError;
    }
  }

  it("distinguishes a bad key from a disabled API from an exhausted quota", async () => {
    // The three have completely different fixes, so they must not collapse
    // into one "something went wrong".
    const badKey = await failWith(400, {
      error: { message: "API key not valid", errors: [{ reason: "badRequest" }] }
    });
    expect(badKey.kind).toBe("invalid-key");

    const notEnabled = await failWith(403, {
      error: {
        message: "YouTube Data API v3 has not been used in project…",
        errors: [{ reason: "accessNotConfigured" }]
      }
    });
    expect(notEnabled.kind).toBe("not-enabled");

    const quota = await failWith(403, {
      error: {
        message: "The request cannot be completed because you have exceeded your quota.",
        errors: [{ reason: "quotaExceeded" }]
      }
    });
    expect(quota.kind).toBe("quota");
  });

  it("reports a network failure as such", async () => {
    const api = createYouTubeApi({
      fetchImpl: (async () => {
        throw new Error("offline");
      }) as never
    });

    await expect(api.verifyKey(KEY)).rejects.toMatchObject({ kind: "network" });
  });

  it("keeps the API's own message for diagnosis", async () => {
    const error = await failWith(400, { error: { message: "API key not valid" } });
    expect(error.message).toContain("API key not valid");
  });
});

describe("searchCacheKey", () => {
  it("never contains the API key", () => {
    const key = searchCacheKey({
      apiKey: "AIzaSECRET",
      after: "2010-01-01",
      before: "2012-08-12",
      order: "viewCount",
      query: "cats"
    });

    expect(key).not.toContain("AIzaSECRET");
    expect(key).toContain("2012-08-12");
  });

  it("separates different windows and orderings", () => {
    const base = {
      apiKey: KEY,
      after: null,
      before: "2012-08-12",
      order: "viewCount"
    } as const;

    expect(searchCacheKey(base)).not.toBe(
      searchCacheKey({ ...base, before: "2013-01-01" })
    );
    expect(searchCacheKey(base)).not.toBe(
      searchCacheKey({ ...base, order: "date" })
    );
    expect(searchCacheKey(base)).toBe(searchCacheKey({ ...base }));
    expect(searchCacheKey(base)).not.toBe(
      searchCacheKey({ ...base, pageToken: "next-page" })
    );
  });
});

describe("quota constants", () => {
  it("reflects the API's published costs", () => {
    expect(QUOTA_SEARCH).toBe(100);
    expect(DAILY_QUOTA).toBe(10_000);
  });
});
