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

import { isValidCalendarDate, todayAsCalendarDate } from "../core/date.js";
import type {
  ConfigurableSurface,
  Settings,
  UnknownPolicy
} from "../core/types.js";

const STORAGE_KEY = "settings";

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
    unknownPolicy: "hide",
    showTimelineBadge: true,
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

  return {
    enabled: asBoolean(source["enabled"], defaults.enabled),
    virtualDate,
    unknownPolicy,
    showTimelineBadge: asBoolean(
      source["showTimelineBadge"],
      defaults.showTimelineBadge
    ),
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
