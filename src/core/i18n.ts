/**
 * Runtime localisation.
 *
 * Deliberately not `chrome.i18n`/`_locales`: that resolves against the browser
 * UI language and cannot be overridden at runtime. People routinely run Chrome
 * in one language and YouTube in another, so the language is a setting the user
 * can change, with "automatic" as the default.
 */

import { de } from "../i18n/de.js";
import { en, type Catalog, type MessageKey } from "../i18n/en.js";
import { es } from "../i18n/es.js";
import { ja } from "../i18n/ja.js";
import { ko } from "../i18n/ko.js";
import { zh } from "../i18n/zh.js";
import type { CalendarDate } from "./types.js";
import { parseCalendarDate } from "./date.js";

export type ResolvedLanguage = "en" | "ja" | "zh" | "ko" | "es" | "de";
export type Language = "auto" | ResolvedLanguage;

export const LANGUAGES: Language[] = ["auto", "en", "ja", "zh", "ko", "es", "de"];

/** Endonyms: a language list is only useful in the language it names. */
export const LANGUAGE_NAMES: Record<ResolvedLanguage, string> = {
  en: "English",
  ja: "日本語",
  zh: "简体中文",
  ko: "한국어",
  es: "Español",
  de: "Deutsch"
};

const CATALOGS: Record<ResolvedLanguage, Catalog> = { en, ja, zh, ko, es, de };

/** BCP 47 tags we map onto a catalog. */
const LOCALE_PREFIXES: Array<[string, ResolvedLanguage]> = [
  ["ja", "ja"],
  ["zh", "zh"],
  ["ko", "ko"],
  ["es", "es"],
  ["de", "de"],
  ["en", "en"]
];

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as string[]).includes(value);
}

/**
 * Pick a catalog for the setting.
 *
 * `auto` walks the browser's preference list in order, so a user whose Chrome
 * is Japanese but who also lists Spanish gets Japanese. Anything unrecognised
 * falls back to English rather than to an arbitrary first entry.
 */
export function resolveLanguage(
  setting: Language,
  preferred: readonly string[] = []
): ResolvedLanguage {
  if (setting !== "auto") return setting;

  for (const tag of preferred) {
    const normalized = tag.toLowerCase();
    for (const [prefix, language] of LOCALE_PREFIXES) {
      if (normalized === prefix || normalized.startsWith(`${prefix}-`)) {
        return language;
      }
    }
  }

  return "en";
}

/** The browser's language preferences, most-preferred first. */
export function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  if (navigator.languages && navigator.languages.length > 0) {
    return navigator.languages;
  }
  return navigator.language ? [navigator.language] : [];
}

export type Translator = {
  (key: MessageKey, params?: Record<string, string | number>): string;
  language: ResolvedLanguage;
  /** Formats a calendar date for this language, e.g. `2012年8月12日`. */
  date(date: CalendarDate): string;
};

export function createTranslator(language: ResolvedLanguage): Translator {
  const catalog = CATALOGS[language];

  const translate = ((key: MessageKey, params?: Record<string, string | number>) => {
    // English is the fallback for a key a translation somehow lacks; the type
    // system prevents this, but a bad runtime merge should not print "{key}".
    const template = catalog[key] ?? en[key] ?? key;
    if (!params) return template;

    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match
    );
  }) as Translator;

  translate.language = language;
  translate.date = (date: CalendarDate) => formatDate(date, language);

  return translate;
}

const LOCALE_TAGS: Record<ResolvedLanguage, string> = {
  en: "en-GB",
  ja: "ja-JP",
  zh: "zh-CN",
  ko: "ko-KR",
  es: "es-ES",
  de: "de-DE"
};

/**
 * Format a calendar date in the given language.
 *
 * Built in UTC on purpose: the value is a bare calendar day, and letting
 * `Intl` project it through the local timezone would print the day before for
 * anyone west of Greenwich.
 */
export function formatDate(date: CalendarDate, language: ResolvedLanguage): string {
  const parts = parseCalendarDate(date);
  if (!parts) return String(date);

  const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

  try {
    return new Intl.DateTimeFormat(LOCALE_TAGS[language], {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC"
    }).format(value);
  } catch {
    return date;
  }
}

export type { Catalog, MessageKey };
