import { describe, expect, it } from "vitest";

import {
  addDays,
  calendarDateFromIso,
  compareCalendarDates,
  differenceInDays,
  formatCalendarDateHuman,
  isOnOrBefore,
  isValidCalendarDate,
  parseCalendarDate,
  toEpochDay,
  todayAsCalendarDate
} from "../src/core/date";

describe("parseCalendarDate", () => {
  it("accepts a well-formed date", () => {
    expect(parseCalendarDate("2012-08-12")).toEqual({
      year: 2012,
      month: 8,
      day: 12
    });
  });

  it("rejects impossible dates instead of rolling them over", () => {
    for (const value of [
      "2012-99-99",
      "2012-13-01",
      "2012-00-10",
      "2012-01-00",
      "2012-04-31",
      "2013-02-29"
    ]) {
      expect(parseCalendarDate(value), value).toBeNull();
    }
  });

  it("accepts 29 February in a leap year", () => {
    expect(isValidCalendarDate("2012-02-29")).toBe(true);
    expect(isValidCalendarDate("2000-02-29")).toBe(true);
    expect(isValidCalendarDate("1900-02-29")).toBe(false);
  });

  it("requires zero-padded fixed-width components", () => {
    for (const value of ["2012-8-12", "2012-08-1", "12-08-12", "2012/08/12"]) {
      expect(parseCalendarDate(value), value).toBeNull();
    }
  });

  it("rejects non-strings", () => {
    for (const value of [null, undefined, 20120812, {}, ["2012-08-12"]]) {
      expect(parseCalendarDate(value)).toBeNull();
    }
  });
});

describe("compareCalendarDates", () => {
  const virtualDate = "2012-08-12";

  it("treats the virtual date itself as being in the past (inclusive boundary)", () => {
    expect(compareCalendarDates("2012-08-12", virtualDate)).toBe(0);
    expect(isOnOrBefore("2012-08-12", virtualDate)).toBe(true);
  });

  it("orders days either side of the boundary", () => {
    expect(compareCalendarDates("2012-08-11", virtualDate)).toBeLessThan(0);
    expect(compareCalendarDates("2012-08-13", virtualDate)).toBeGreaterThan(0);
  });

  it("orders across month and year boundaries", () => {
    expect(compareCalendarDates("2012-07-31", "2012-08-01")).toBeLessThan(0);
    expect(compareCalendarDates("2011-12-31", "2012-01-01")).toBeLessThan(0);
    expect(compareCalendarDates("2012-01-01", "2011-12-31")).toBeGreaterThan(0);
  });

  it("throws on invalid input rather than failing open", () => {
    expect(() => compareCalendarDates("2012-99-99", virtualDate)).toThrow();
    expect(() => compareCalendarDates(virtualDate, "")).toThrow();
  });
});

describe("todayAsCalendarDate", () => {
  it("uses local calendar fields, not a UTC projection", () => {
    // 23:30 local on the 12th is still the 12th, in every timezone. Going
    // through Date#toISOString here would yield the 13th east of UTC.
    const late = new Date(2012, 7, 12, 23, 30, 0);
    expect(todayAsCalendarDate(late)).toBe("2012-08-12");

    const early = new Date(2012, 7, 12, 0, 30, 0);
    expect(todayAsCalendarDate(early)).toBe("2012-08-12");
  });
});

describe("calendarDateFromIso", () => {
  it("keeps the date component of a timestamp", () => {
    expect(calendarDateFromIso("2014-05-01")).toBe("2014-05-01");
    expect(calendarDateFromIso("2009-10-25T07:15:33-07:00")).toBe("2009-10-25");
    expect(calendarDateFromIso("  2009-10-25T07:15:33Z ")).toBe("2009-10-25");
  });

  it("rejects anything that is not an ISO date", () => {
    for (const value of ["yesterday", "2 years ago", "", null, "01-05-2014"]) {
      expect(calendarDateFromIso(value)).toBeNull();
    }
  });

  it("rejects an ISO-shaped but impossible date", () => {
    expect(calendarDateFromIso("2014-02-30")).toBeNull();
  });
});

describe("date arithmetic", () => {
  it("adds and subtracts days across boundaries", () => {
    expect(addDays("2012-08-12", 1)).toBe("2012-08-13");
    expect(addDays("2012-08-31", 1)).toBe("2012-09-01");
    expect(addDays("2012-01-01", -1)).toBe("2011-12-31");
    expect(addDays("2012-02-28", 1)).toBe("2012-02-29");
    expect(addDays("2013-02-28", 1)).toBe("2013-03-01");
  });

  it("round-trips through epoch days", () => {
    expect(toEpochDay("1970-01-01")).toBe(0);
    expect(addDays("1970-01-01", toEpochDay("2012-08-12"))).toBe("2012-08-12");
  });

  it("measures signed differences", () => {
    expect(differenceInDays("2012-08-13", "2012-08-12")).toBe(1);
    expect(differenceInDays("2012-08-12", "2012-08-13")).toBe(-1);
    expect(differenceInDays("2013-01-01", "2012-01-01")).toBe(366);
  });
});

describe("formatCalendarDateHuman", () => {
  it("formats for the popup and the block overlay", () => {
    expect(formatCalendarDateHuman("2012-08-12")).toBe("12 August 2012");
    expect(formatCalendarDateHuman("2005-02-14")).toBe("14 February 2005");
  });

  it("passes through unparseable input untouched", () => {
    expect(formatCalendarDateHuman("nonsense")).toBe("nonsense");
  });
});
