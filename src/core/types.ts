/**
 * Shared vocabulary for every layer of the extension.
 *
 * Nothing in this file may import from `content/`, `background/`, `popup/` or
 * touch a Chrome API: the core layer is deliberately environment-free so that
 * it is testable in plain Node.
 */

import type { Language } from "./i18n.js";

/** A canonical 11-character YouTube video id, e.g. `dQw4w9WgXcQ`. */
export type VideoId = string;

/**
 * A calendar day in `YYYY-MM-DD` form.
 *
 * Deliberately a *calendar* date and not a timestamp: the value the user sets
 * in the popup means "the day it is, in the virtual present", and the dates we
 * read out of YouTube's metadata are day-granular. Comparisons are done on the
 * (year, month, day) tuple so that no timezone conversion can shift a video
 * across the boundary. See `core/date.ts`.
 */
export type CalendarDate = string;

/** Which YouTube surface a video card was found on. */
export type Surface =
  | "home"
  | "search"
  | "watchRelated"
  | "channel"
  | "subscriptions"
  | "playlists"
  | "shorts"
  | "other";

/** Surfaces the user can individually switch off. `other` is always filtered. */
export type ConfigurableSurface = Exclude<Surface, "other">;

/** What to do with a video whose publication date could not be determined. */
export type UnknownPolicy = "hide" | "show";

export interface Settings {
  enabled: boolean;

  /** The virtual present. Videos published after this day are unavailable. */
  virtualDate: CalendarDate;

  /**
   * Optional start of the window. When set, videos published *before* it are
   * hidden too, so the timeline is a period rather than "everything up to a
   * date". `null` means no lower bound.
   */
  rangeStart: CalendarDate | null;

  unknownPolicy: UnknownPolicy;

  showTimelineBadge: boolean;

  /**
   * Hide parts of YouTube's interface that did not exist at the virtual
   * present — Shorts, Playables, Podcasts and so on. Filtering videos by date
   * leaves the surrounding product looking like 2026 regardless.
   */
  hideFutureFeatures: boolean;

  /** Feature ids the user has chosen to keep despite being anachronistic. */
  allowedFeatures: string[];

  /** How many visible videos to aim for before refilling stops. */
  fillTargetVisible: number;

  /** Upper bound on extra page loads per feed. */
  fillMaxRounds: number;

  /**
   * Look for era videos beyond what YouTube recommends, by walking its
   * related-video graph outward from videos already inside the window.
   */
  discoverEra: boolean;

  /**
   * Keep asking YouTube for more items while filtering leaves a feed nearly
   * empty. Without this, a distant virtual present produces a blank page:
   * today's recommendations are almost all too new to survive the filter.
   */
  fillFeed: boolean;

  /** UI language; `auto` follows the browser's preferences. */
  language: Language;

  surfaces: Record<ConfigurableSurface, boolean>;
}

/** Where a publication date came from. Recorded for debugging and cache busting. */
export type ResolutionSource =
  | "cache"
  | "youtube-html"
  | "document-meta"
  | "relative-date"
  | "unknown";

export type ResolutionConfidence = "exact-day" | "approximate" | "unknown";

export interface PublicationResolution {
  videoId: VideoId;

  /** `null` means "not determined" — never "no restriction". */
  publishedDate: CalendarDate | null;

  source: ResolutionSource;

  confidence: ResolutionConfidence;

  /** Epoch milliseconds at which this resolution was produced. */
  resolvedAt: number;
}

/**
 * The verdict for a single video card.
 *
 * `pending` is not produced by the policy layer — it is the state a card sits
 * in between discovery and resolution, and it is hidden, so that a future video
 * is never painted before we know what it is.
 */
export type CardState = "pending" | "visible" | "future" | "before" | "unknown";
