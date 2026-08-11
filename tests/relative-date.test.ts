import { describe, expect, it } from "vitest";

import { parseRelativeDate, resolutionPriority } from "../src/content/relative-date";

const TODAY = "2026-08-12";

describe("parseRelativeDate (English)", () => {
  it("parses the units YouTube uses", () => {
    expect(parseRelativeDate("2 years ago", TODAY)?.unit).toBe("year");
    expect(parseRelativeDate("1 year ago", TODAY)?.unit).toBe("year");
    expect(parseRelativeDate("3 months ago", TODAY)?.unit).toBe("month");
    expect(parseRelativeDate("2 weeks ago", TODAY)?.unit).toBe("week");
    expect(parseRelativeDate("5 days ago", TODAY)?.unit).toBe("day");
    expect(parseRelativeDate("13 hours ago", TODAY)?.unit).toBe("hour");
    expect(parseRelativeDate("42 minutes ago", TODAY)?.unit).toBe("minute");
  });

  it("finds the timestamp inside surrounding metadata text", () => {
    expect(parseRelativeDate("1.2M views • 3 months ago", TODAY)?.unit).toBe("month");
    expect(parseRelativeDate("Streamed 2 years ago", TODAY)?.unit).toBe("year");
  });

  it("computes an approximate date", () => {
    expect(parseRelativeDate("5 days ago", TODAY)?.approximateDate).toBe("2026-08-07");
    expect(parseRelativeDate("2 hours ago", TODAY)?.approximateDate).toBe(TODAY);
  });
});

describe("parseRelativeDate (Japanese)", () => {
  it("parses the units YouTube uses", () => {
    expect(parseRelativeDate("5 日前", TODAY)?.unit).toBe("day");
    expect(parseRelativeDate("5日前", TODAY)?.unit).toBe("day");
    expect(parseRelativeDate("2 年前", TODAY)?.unit).toBe("year");
    expect(parseRelativeDate("3 か月前", TODAY)?.unit).toBe("month");
    expect(parseRelativeDate("3ヶ月前", TODAY)?.unit).toBe("month");
    expect(parseRelativeDate("2 週間前", TODAY)?.unit).toBe("week");
    expect(parseRelativeDate("10 分前", TODAY)?.unit).toBe("minute");
    expect(parseRelativeDate("2 時間前", TODAY)?.unit).toBe("hour");
  });

  it("does not mistake か月 for 月", () => {
    const months = parseRelativeDate("3 か月前", TODAY);
    expect(months?.approximateAgeDays).toBe(90);
  });

  it("finds the timestamp inside surrounding metadata text", () => {
    expect(parseRelativeDate("1.2万 回視聴 • 5 日前", TODAY)?.unit).toBe("day");
  });
});

describe("parseRelativeDate (rejections)", () => {
  it("returns null for absolute dates, which are the resolver's job", () => {
    expect(parseRelativeDate("Aug 12, 2012", TODAY)).toBeNull();
    expect(parseRelativeDate("2012-08-12", TODAY)).toBeNull();
    expect(parseRelativeDate("Premieres Aug 20", TODAY)).toBeNull();
  });

  it("returns null for text with no timestamp", () => {
    expect(parseRelativeDate("1.2M views", TODAY)).toBeNull();
    expect(parseRelativeDate("", TODAY)).toBeNull();
    expect(parseRelativeDate(null, TODAY)).toBeNull();
  });
});

describe("resolutionPriority", () => {
  it("orders older-looking cards first, and unhinted cards in between", () => {
    const old = resolutionPriority(parseRelativeDate("12 years ago", TODAY));
    const recent = resolutionPriority(parseRelativeDate("2 hours ago", TODAY));
    const none = resolutionPriority(null);

    expect(old).toBeGreaterThan(none);
    expect(none).toBeGreaterThanOrEqual(recent);
  });
});
