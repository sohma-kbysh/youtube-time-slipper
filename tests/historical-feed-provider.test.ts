import { describe, expect, it, vi } from "vitest";

import { createHistoricalFeedProvider } from "../src/background/historical-feed-provider";

const BASE = {
  apiKey: "AIzaTestKey",
  order: "viewCount" as const,
  start: "2010-01-01",
  end: "2012-12-31",
  needed: 20,
  seeds: ["SSSSSSSSSSS"],
  exclude: ["NNNNNNNNNNN"]
};

function video(videoId: string, publishedDate = "2011-06-01") {
  return { videoId, title: `title ${videoId}`, publishedDate };
}

function discovery(videos: ReturnType<typeof video>[] = []) {
  return {
    discover: vi.fn(async () =>
      videos.map((entry) => ({ ...entry, depth: 1 }))
    )
  };
}

describe("HistoricalFeedProvider", () => {
  it("follows nextPageToken until the requested number of unique videos is filled", async () => {
    const first = Array.from({ length: 10 }, (_, index) =>
      video(`A${String(index).padStart(10, "0")}`)
    );
    const second = Array.from({ length: 10 }, (_, index) =>
      video(`B${String(index).padStart(10, "0")}`)
    );
    const search = vi
      .fn()
      .mockResolvedValueOnce({ videos: first, source: "api", nextPageToken: "page-2" })
      .mockResolvedValueOnce({ videos: second, source: "api" });

    const provider = createHistoricalFeedProvider({
      eraSearch: { search },
      discovery: discovery()
    });
    const result = await provider.provide({ ...BASE, needed: 15 });

    expect(result.videos).toHaveLength(15);
    expect(result.source).toBe("api");
    expect(search).toHaveBeenCalledTimes(2);
    expect(search.mock.calls[1]?.[0]).toMatchObject({ pageToken: "page-2", limit: 50 });
  });

  it("deduplicates native ids and duplicates between API pages", async () => {
    const duplicate = video("DDDDDDDDDDD");
    const search = vi
      .fn()
      .mockResolvedValueOnce({
        videos: [video("NNNNNNNNNNN"), duplicate],
        source: "api",
        nextPageToken: "next"
      })
      .mockResolvedValueOnce({
        videos: [duplicate, video("FFFFFFFFFFF")],
        source: "api"
      });

    const provider = createHistoricalFeedProvider({
      eraSearch: { search },
      discovery: discovery()
    });
    const result = await provider.provide({ ...BASE, needed: 3 });

    expect(result.videos.map((entry) => entry.videoId)).toEqual([
      "DDDDDDDDDDD",
      "FFFFFFFFFFF"
    ]);
  });

  it("accepts both inclusive boundaries and rejects out-of-window API results", async () => {
    const search = vi.fn(async () => ({
      source: "api" as const,
      videos: [
        video("AAAAAAAAAAA", "2010-01-01"),
        video("BBBBBBBBBBB", "2012-12-31"),
        video("CCCCCCCCCCC", "2009-12-31"),
        video("DDDDDDDDDDD", "2013-01-01")
      ]
    }));
    const provider = createHistoricalFeedProvider({
      eraSearch: { search },
      discovery: discovery()
    });

    const result = await provider.provide(BASE);

    expect(result.videos.map((entry) => entry.videoId)).toEqual([
      "AAAAAAAAAAA",
      "BBBBBBBBBBB"
    ]);
  });

  it("falls back to the related graph when API access fails", async () => {
    const fallback = discovery([video("FFFFFFFFFFF")]);
    const provider = createHistoricalFeedProvider({
      eraSearch: {
        search: vi.fn(async () => ({
          videos: [],
          source: "unavailable" as const,
          errorKind: "network"
        }))
      },
      discovery: fallback
    });

    const result = await provider.provide(BASE);

    expect(result.source).toBe("related");
    expect(result.errorKind).toBe("network");
    expect(fallback.discover).toHaveBeenCalledOnce();
  });

  it("falls back to the related graph when no API key is configured", async () => {
    const fallback = discovery([video("FFFFFFFFFFF")]);
    const provider = createHistoricalFeedProvider({
      eraSearch: {
        search: vi.fn(async () => ({ videos: [], source: "unavailable" as const }))
      },
      discovery: fallback
    });

    const result = await provider.provide({ ...BASE, apiKey: "" });

    expect(result.source).toBe("related");
    expect(fallback.discover).toHaveBeenCalledOnce();
  });

  it("does not mix in related results after a successful empty API search", async () => {
    const fallback = discovery([video("FFFFFFFFFFF")]);
    const provider = createHistoricalFeedProvider({
      eraSearch: {
        search: vi.fn(async () => ({ videos: [], source: "api" as const }))
      },
      discovery: fallback
    });

    const result = await provider.provide(BASE);

    expect(result).toMatchObject({ videos: [], source: "api", exhausted: true });
    expect(fallback.discover).not.toHaveBeenCalled();
  });
});
