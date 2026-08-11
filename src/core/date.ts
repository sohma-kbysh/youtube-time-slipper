/**
 * Calendar-date arithmetic and comparison.
 *
 * The one rule this module exists to enforce: a `CalendarDate` is never routed
 * through a local-time `Date` for comparison. Constructing `new Date("2012-08-12")`
 * yields UTC midnight, which renders as 2012-08-11 in any negative-offset zone;
 * a user in Los Angeles would silently get a virtual present one day earlier
 * than the one they typed. Everything below works on the (year, month, day)
 * tuple, and the only `Date` use is the epoch-day arithmetic in `addDays`,
 * which is done entirely in UTC.
 */

import type { CalendarDate } from "./types.js";

export interface CalendarParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31, valid for the month
}

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Matches the date portion of an ISO 8601 date or date-time string. */
const ISO_PREFIX_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/;

const MS_PER_DAY = 86_400_000;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
] as const;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

/**
 * Parse a strict `YYYY-MM-DD` string.
 *
 * Returns `null` for anything that is not a real calendar day, including
 * out-of-range months, day 0, 2013-02-29, and non-strings. Nothing is coerced
 * or rolled over: `2012-99-99` is rejected, not turned into a date in 2020.
 */
export function parseCalendarDate(value: unknown): CalendarParts | null {
  if (typeof value !== "string") return null;

  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;

  // YouTube launched in 2005; a year outside this window is a parser artefact,
  // not a real upload date.
  if (year < 1900 || year > 9999) return null;

  return { year, month, day };
}

export function isValidCalendarDate(value: unknown): value is CalendarDate {
  return parseCalendarDate(value) !== null;
}

export function formatCalendarDate(parts: CalendarParts): CalendarDate {
  const year = String(parts.year).padStart(4, "0");
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Compare two calendar dates chronologically.
 *
 * Returns a negative number if `a` is earlier than `b`, zero if they are the
 * same day, and a positive number if `a` is later. Throws on invalid input
 * rather than guessing, because every caller is making an access-control
 * decision and a silent `NaN` would fail open.
 */
export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  const left = parseCalendarDate(a);
  const right = parseCalendarDate(b);

  if (!left) throw new TypeError(`invalid calendar date: ${String(a)}`);
  if (!right) throw new TypeError(`invalid calendar date: ${String(b)}`);

  if (left.year !== right.year) return left.year - right.year;
  if (left.month !== right.month) return left.month - right.month;
  return left.day - right.day;
}

/** True when `a` is the same day as, or earlier than, `b`. */
export function isOnOrBefore(a: CalendarDate, b: CalendarDate): boolean {
  return compareCalendarDates(a, b) <= 0;
}

/** The user's *local* today, which is the day they mean by "today". */
export function todayAsCalendarDate(now: Date = new Date()): CalendarDate {
  return formatCalendarDate({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate()
  });
}

/**
 * Extract the calendar day from an ISO 8601 date or date-time string.
 *
 * YouTube's `datePublished` metadata is usually a bare `2014-05-01`, but some
 * responses carry a full timestamp with an offset. We keep the date component
 * verbatim rather than normalising to UTC: the date YouTube prints is the one
 * the platform considers the upload day, and re-projecting it into another zone
 * would move videos across the boundary for no benefit.
 */
export function calendarDateFromIso(value: unknown): CalendarDate | null {
  if (typeof value !== "string") return null;

  const match = ISO_PREFIX_PATTERN.exec(value.trim());
  if (!match) return null;

  const date = match[1] as string;
  return isValidCalendarDate(date) ? date : null;
}

/** Days elapsed since 1970-01-01, computed in UTC so the result is stable. */
export function toEpochDay(date: CalendarDate): number {
  const parts = parseCalendarDate(date);
  if (!parts) throw new TypeError(`invalid calendar date: ${String(date)}`);
  return Math.round(Date.UTC(parts.year, parts.month - 1, parts.day) / MS_PER_DAY);
}

export function fromEpochDay(epochDay: number): CalendarDate {
  const utc = new Date(epochDay * MS_PER_DAY);
  return formatCalendarDate({
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate()
  });
}

/** Shift a calendar date by whole days. Negative values move into the past. */
export function addDays(date: CalendarDate, days: number): CalendarDate {
  return fromEpochDay(toEpochDay(date) + Math.trunc(days));
}

/** Signed difference in days: `a - b`. */
export function differenceInDays(a: CalendarDate, b: CalendarDate): number {
  return toEpochDay(a) - toEpochDay(b);
}

/** Human-readable form for the popup and the block overlay, e.g. `12 August 2012`. */
export function formatCalendarDateHuman(date: CalendarDate): string {
  const parts = parseCalendarDate(date);
  if (!parts) return String(date);
  return `${parts.day} ${MONTH_NAMES[parts.month - 1]} ${parts.year}`;
}
