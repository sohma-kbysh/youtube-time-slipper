/**
 * Settings persistence on top of `chrome.storage.local`.
 *
 * Two properties matter here:
 *
 *  - Every read is sanitised. Storage can contain values written by an older
 *    version of the extension, or garbage; a malformed `virtualDate` must not
 *    turn into "no filtering". Anything invalid falls back to the default.
 *  - Changes propagate live. The popup writes, and every open YouTube tab
 *    re-evaluates through `chrome.storage.onChanged` without a page reload.
 */

import {
  compareCalendarDates,
  isValidCalendarDate,
  todayAsCalendarDate
} from "../core/date.js";
import { isLanguage } from "../core/i18n.js";
import type {
  ConfigurableSurface,
  Settings,
  UnknownPolicy
} from "../core/types.js";

const STORAGE_KEY = "settings";

/**
 * Refill defaults, and the range the popup and normaliser will accept.
 *
 * Declared above `defaultSettings`, which reads them at module evaluation time
 * to build `DEFAULT_SETTINGS`.
 */
export const DEFAULT_FILL_TARGET = 20;
export const MIN_FILL_TARGET = 5;
export const MAX_FILL_TARGET = 200;

export const DEFAULT_FILL_ROUNDS = 25;
export const MIN_FILL_ROUNDS = 1;
/**
 * Upper bound on extra page loads. High enough to fill a page for a cutoff a
 * few years back, and bounded so a setting cannot turn into an unbounded crawl
 * of YouTube from a single tab.
 */
export const MAX_FILL_ROUNDS = 300;

export const CONFIGURABLE_SURFACES: ConfigurableSurface[] = [
  "home",
  "search",
  "watchRelated",
  "channel",
  "subscriptions",
  "playlists",
  "shorts"
];

/**
 * Defaults.
 *
 * `enabled: false` so that installing the extension does not silently change
 * what the user sees before they have chosen a date.
 *
 * `unknownPolicy: "hide"` is the fail-closed default: a video we cannot date
 * might be from the future, and the point of the extension is that the future
 * does not leak in.
 */
export function defaultSettings(now: Date = new Date()): Settings {
  return {
    enabled: false,
    virtualDate: todayAsCalendarDate(now),
    rangeStart: null,
    unknownPolicy: "hide",
    showTimelineBadge: true,
    hideFutureFeatures: true,
    allowedFeatures: [],
    fillFeed: true,
    fillTargetVisible: DEFAULT_FILL_TARGET,
    fillMaxRounds: DEFAULT_FILL_ROUNDS,
    discoverEra: true,
    language: "auto",
    surfaces: {
      home: true,
      search: true,
      watchRelated: true,
      channel: true,
      subscriptions: true,
      playlists: true,
      shorts: true
    }
  };
}

export const DEFAULT_SETTINGS: Settings = defaultSettings();

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

/**
 * Coerce arbitrary stored data into a valid `Settings` object.
 *
 * Exported because it is the part worth unit-testing: it is the boundary
 * between untrusted persisted state and the policy layer.
 */
export function normalizeSettings(raw: unknown, now: Date = new Date()): Settings {
  const defaults = defaultSettings(now);

  if (typeof raw !== "object" || raw === null) return defaults;

  const source = raw as Record<string, unknown>;

  const virtualDate = isValidCalendarDate(source["virtualDate"])
    ? (source["virtualDate"] as string)
    : defaults.virtualDate;

  const unknownPolicy: UnknownPolicy =
    source["unknownPolicy"] === "show" ? "show" : "hide";

  const rawSurfaces =
    typeof source["surfaces"] === "object" && source["surfaces"] !== null
      ? (source["surfaces"] as Record<string, unknown>)
      : {};

  const surfaces = { ...defaults.surfaces };
  for (const surface of CONFIGURABLE_SURFACES) {
    surfaces[surface] = asBoolean(rawSurfaces[surface], defaults.surfaces[surface]);
  }

  // A start date after the virtual present would hide everything, which is
  // never what the user meant; drop it rather than empty the page.
  const rawStart = source["rangeStart"];
  const rangeStart =
    isValidCalendarDate(rawStart) &&
    compareCalendarDates(rawStart as string, virtualDate) <= 0
      ? (rawStart as string)
      : null;

  return {
    enabled: asBoolean(source["enabled"], defaults.enabled),
    virtualDate,
    rangeStart,
    unknownPolicy,
    showTimelineBadge: asBoolean(
      source["showTimelineBadge"],
      defaults.showTimelineBadge
    ),
    hideFutureFeatures: asBoolean(
      source["hideFutureFeatures"],
      defaults.hideFutureFeatures
    ),
    allowedFeatures: asStringArray(source["allowedFeatures"]),
    fillFeed: asBoolean(source["fillFeed"], defaults.fillFeed),
    fillTargetVisible: asInteger(
      source["fillTargetVisible"],
      defaults.fillTargetVisible,
      MIN_FILL_TARGET,
      MAX_FILL_TARGET
    ),
    fillMaxRounds: asInteger(
      source["fillMaxRounds"],
      defaults.fillMaxRounds,
      MIN_FILL_ROUNDS,
      MAX_FILL_ROUNDS
    ),
    discoverEra: asBoolean(source["discoverEra"], defaults.discoverEra),
    language: isLanguage(source["language"]) ? source["language"] : defaults.language,
    surfaces
  };
}

export async function loadSettings(): Promise<Settings> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return normalizeSettings(stored?.[STORAGE_KEY]);
  } catch {
    // Storage can be unavailable while the extension is being reloaded.
    // Defaults have `enabled: false`, so this fails to "do nothing", not to
    // "show everything the user asked to hide" — the page is left untouched.
    return defaultSettings();
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: normalizeSettings(settings) });
}

export async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const next = normalizeSettings({ ...current, ...patch });
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

/**
 * Subscribe to settings changes. Returns an unsubscribe function.
 */
export function onSettingsChanged(
  listener: (settings: Settings) => void
): () => void {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ): void => {
    if (areaName !== "local") return;
    if (!(STORAGE_KEY in changes)) return;
    listener(normalizeSettings(changes[STORAGE_KEY]?.newValue));
  };

  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
