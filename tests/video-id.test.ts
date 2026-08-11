import { describe, expect, it } from "vitest";

import { isValidVideoId, videoIdFromHref } from "../src/content/video-id";

const ID = "dQw4w9WgXcQ";

describe("isValidVideoId", () => {
  it("accepts an 11-character URL-safe id", () => {
    expect(isValidVideoId(ID)).toBe(true);
    expect(isValidVideoId("_-aA09zZ-_1")).toBe(true);
  });

  it("rejects wrong lengths and illegal characters", () => {
    for (const value of [
      "dQw4w9WgXc",
      "dQw4w9WgXcQQ",
      "dQw4w9WgXc!",
      "dQw4w9WgXc/",
      "",
      null,
      undefined,
      11
    ]) {
      expect(isValidVideoId(value), String(value)).toBe(false);
    }
  });
});

describe("videoIdFromHref", () => {
  it("reads the id from watch links", () => {
    expect(videoIdFromHref(`/watch?v=${ID}`)).toBe(ID);
    expect(videoIdFromHref(`/watch?v=${ID}&t=10`)).toBe(ID);
    expect(videoIdFromHref(`/watch?t=10&v=${ID}&list=PL123`)).toBe(ID);
    expect(videoIdFromHref(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
  });

  it("reads the id from Shorts, embed, live and youtu.be links", () => {
    expect(videoIdFromHref(`/shorts/${ID}`)).toBe(ID);
    expect(videoIdFromHref(`/shorts/${ID}?feature=share`)).toBe(ID);
    expect(videoIdFromHref(`/embed/${ID}?autoplay=1`)).toBe(ID);
    expect(videoIdFromHref(`/live/${ID}`)).toBe(ID);
    expect(videoIdFromHref(`https://youtu.be/${ID}`)).toBe(ID);
    expect(videoIdFromHref(`https://www.youtube.com/shorts/${ID}`)).toBe(ID);
  });

  it("returns null for links that address no single video", () => {
    expect(videoIdFromHref("/watch?list=PL123")).toBeNull();
    expect(videoIdFromHref("/playlist?list=PL123")).toBeNull();
    expect(videoIdFromHref("/@someone")).toBeNull();
    expect(videoIdFromHref("/feed/subscriptions")).toBeNull();
    expect(videoIdFromHref("/results?search_query=cats")).toBeNull();
    expect(videoIdFromHref("")).toBeNull();
    expect(videoIdFromHref(null)).toBeNull();
  });

  it("returns null for a malformed id rather than passing it through", () => {
    expect(videoIdFromHref("/watch?v=short")).toBeNull();
    expect(videoIdFromHref("/shorts/way-too-long-to-be-an-id")).toBeNull();
    expect(videoIdFromHref("/watch?v=../../etc/passwd")).toBeNull();
  });

  it("refuses hosts that are not YouTube", () => {
    // The id crosses into the service worker, which builds a fetch URL from
    // it. An off-site href must never become a resolvable video.
    expect(videoIdFromHref(`https://evil.example/watch?v=${ID}`)).toBeNull();
    expect(videoIdFromHref(`https://youtube.com.evil.example/watch?v=${ID}`)).toBeNull();
    expect(videoIdFromHref("javascript:alert(1)")).toBeNull();
  });

  it("accepts the YouTube hosts that legitimately appear in links", () => {
    expect(videoIdFromHref(`https://m.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(videoIdFromHref(`https://music.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(videoIdFromHref(`https://www.youtube-nocookie.com/embed/${ID}`)).toBe(ID);
  });
});
