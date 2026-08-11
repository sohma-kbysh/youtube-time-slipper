/**
 * Parsing of YouTube's relative timestamps ("3 years ago", "3 年前").
 *
 * IMPORTANT — this is a hint, never an authority.
 *
 * The original Firefox extension this project takes inspiration from decided
 * visibility from these strings, treating a month as 30 days and a year as
 * 365. That is unusable for a date cutoff: "2 years ago" covers a 365-day
 * window, so near the boundary the verdict is a coin flip, and YouTube floors
 * the unit, so the string is really a *bound* rather than a date.
 *
 * What the hint is good for is ordering work. A card that reads "12 years ago"
 * is almost certainly visible under a 2012 cutoff, so resolving it first makes
 * the page fill in sooner; a card that reads "2 hours ago" can wait. No card is
 * ever shown or hidden on the strength of this parse — that decision always
 * waits for `PublicationResolution`.
 */

import { addDays, todayAsCalendarDate } from "../core/date.js";
import type { CalendarDate } from "../core/types.js";

export interface RelativeDateHint {
  /**
   * Approximate publication date. Because YouTube floors the unit ("2 years
   * ago" is anything from 2.0 to 2.99 years old), the true date is at or
   * before this value — it is an upper bound with roughly one unit of slack.
   */
  approximateDate: CalendarDate;

  /** Coarse age in days, used only for ordering. */
  approximateAgeDays: number;

  unit: RelativeUnit;
}

export type RelativeUnit =
  | "second"
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "year";

const DAYS_PER_UNIT: Record<RelativeUnit, number> = {
  second: 0,
  minute: 0,
  hour: 0,
  day: 1,
  week: 7,
  month: 30,
  year: 365
};

/** English unit words, singular and plural. */
const ENGLISH_UNITS: Array<[RegExp, RelativeUnit]> = [
  [/^seconds?$/i, "second"],
  [/^minutes?$/i, "minute"],
  [/^hours?$/i, "hour"],
  [/^days?$/i, "day"],
  [/^weeks?$/i, "week"],
  [/^months?$/i, "month"],
  [/^years?$/i, "year"]
];

const ENGLISH_PATTERN = /(\d+)\s+([a-z]+)\s+ago/i;

/**
 * Japanese: `5日前`, `2 年前`, `3 か月前` / `3ヶ月前` / `3カ月前`, `10 分前`.
 * The month forms are listed before the day form so `か月` is not read as `月`.
 */
const JAPANESE_PATTERN = /(\d+)\s*(秒|分|時間|日|週間|(?:か|ヶ|ケ|カ|箇)月|月|年)\s*前/;

const JAPANESE_UNITS: Array<[RegExp, RelativeUnit]> = [
  [/^秒$/, "second"],
  [/^分$/, "minute"],
  [/^時間$/, "hour"],
  [/^日$/, "day"],
  [/^週間$/, "week"],
  [/^(?:か|ヶ|ケ|カ|箇)?月$/, "month"],
  [/^年$/, "year"]
];

function matchUnit(
  raw: string,
  table: Array<[RegExp, RelativeUnit]>
): RelativeUnit | null {
  for (const [pattern, unit] of table) {
    if (pattern.test(raw)) return unit;
  }
  return null;
}

/**
 * Parse a relative timestamp out of a metadata string.
 *
 * The string may carry surrounding noise ("Streamed 2 years ago",
 * "1.2M views • 3 months ago"), so the pattern is searched rather than
 * anchored. Returns `null` when no relative timestamp is present, including
 * for absolute dates such as "Aug 12, 2012" — those are the resolver's job.
 */
export function parseRelativeDate(
  text: unknown,
  reference: CalendarDate = todayAsCalendarDate()
): RelativeDateHint | null {
  if (typeof text !== "string" || text.length === 0) return null;

  const parsed = parseAmountAndUnit(text);
  if (!parsed) return null;

  const { amount, unit } = parsed;
  const ageDays = amount * DAYS_PER_UNIT[unit];

  return {
    approximateDate: addDays(reference, -ageDays),
    approximateAgeDays: ageDays,
    unit
  };
}

function parseAmountAndUnit(
  text: string
): { amount: number; unit: RelativeUnit } | null {
  const japanese = JAPANESE_PATTERN.exec(text);
  if (japanese) {
    const unit = matchUnit(japanese[2] as string, JAPANESE_UNITS);
    if (unit) return { amount: Number(japanese[1]), unit };
  }

  const english = ENGLISH_PATTERN.exec(text);
  if (english) {
    const unit = matchUnit(english[2] as string, ENGLISH_UNITS);
    if (unit) return { amount: Number(english[1]), unit };
  }

  return null;
}

/**
 * Priority for the resolution queue: larger is resolved sooner.
 *
 * Older-looking cards go first because they are the ones most likely to end up
 * visible, so the page stops looking empty faster. Cards with no hint sit in
 * the middle — they are not penalised for YouTube having changed its metadata
 * markup again.
 */
export function resolutionPriority(hint: RelativeDateHint | null): number {
  if (!hint) return 0;
  return hint.approximateAgeDays;
}
