import { describe, expect, it } from "vitest";

import {
  LANGUAGES,
  LANGUAGE_NAMES,
  createTranslator,
  formatDate,
  isLanguage,
  resolveLanguage,
  type ResolvedLanguage
} from "../src/core/i18n";
import { de } from "../src/i18n/de";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";
import { ja } from "../src/i18n/ja";
import { ko } from "../src/i18n/ko";
import { zh } from "../src/i18n/zh";

const CATALOGS: Record<ResolvedLanguage, Record<string, string>> = {
  en,
  ja,
  zh,
  ko,
  es,
  de
};

const PLACEHOLDER = /\{(\w+)\}/g;

function placeholders(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((match) => match[1]!).sort();
}

describe("catalogs", () => {
  const englishKeys = Object.keys(en).sort();

  for (const [language, catalog] of Object.entries(CATALOGS)) {
    it(`${language} defines exactly the English key set`, () => {
      expect(Object.keys(catalog).sort()).toEqual(englishKeys);
    });

    it(`${language} keeps every placeholder intact`, () => {
      // A translation that drops `{date}` silently prints a sentence with a
      // hole in it, which no type check would catch.
      for (const key of englishKeys) {
        expect(placeholders(catalog[key]!), `${language}: ${key}`).toEqual(
          placeholders(en[key as keyof typeof en])
        );
      }
    });

    it(`${language} has no empty strings`, () => {
      for (const key of englishKeys) {
        expect(catalog[key]!.trim().length, `${language}: ${key}`).toBeGreaterThan(0);
      }
    });
  }

  it("names every language in its own script", () => {
    for (const language of LANGUAGES) {
      if (language === "auto") continue;
      expect(LANGUAGE_NAMES[language]).toBeTruthy();
    }
  });
});

describe("resolveLanguage", () => {
  it("honours an explicit choice regardless of the browser", () => {
    expect(resolveLanguage("de", ["ja-JP"])).toBe("de");
  });

  it("follows the browser's order under 'auto'", () => {
    expect(resolveLanguage("auto", ["ja-JP", "en-US"])).toBe("ja");
    expect(resolveLanguage("auto", ["en-GB"])).toBe("en");
    expect(resolveLanguage("auto", ["ko"])).toBe("ko");
    expect(resolveLanguage("auto", ["es-419"])).toBe("es");
  });

  it("maps every Chinese variant onto the one catalog", () => {
    expect(resolveLanguage("auto", ["zh-CN"])).toBe("zh");
    expect(resolveLanguage("auto", ["zh-TW"])).toBe("zh");
    expect(resolveLanguage("auto", ["zh-Hant-HK"])).toBe("zh");
  });

  it("skips languages it does not have, rather than taking the first entry", () => {
    expect(resolveLanguage("auto", ["fr-FR", "ja-JP"])).toBe("ja");
  });

  it("falls back to English", () => {
    expect(resolveLanguage("auto", ["fr-FR", "it"])).toBe("en");
    expect(resolveLanguage("auto", [])).toBe("en");
  });
});

describe("isLanguage", () => {
  it("accepts known values only", () => {
    expect(isLanguage("auto")).toBe(true);
    expect(isLanguage("ja")).toBe(true);
    expect(isLanguage("fr")).toBe(false);
    expect(isLanguage(null)).toBe(false);
  });
});

describe("createTranslator", () => {
  it("returns the catalog string", () => {
    expect(createTranslator("ja")("popup.today")).toBe("今日");
    expect(createTranslator("de")("popup.today")).toBe("Heute");
  });

  it("substitutes named placeholders", () => {
    const t = createTranslator("en");
    expect(t("popup.statusOn", { date: "12 August 2012" })).toBe(
      "Videos published after 12 August 2012 are hidden."
    );
  });

  it("substitutes several placeholders", () => {
    const t = createTranslator("en");
    expect(t("feed.visibleCount", { visible: 3, total: 40 })).toBe(
      "3 of 40 videos on this page are from your timeline."
    );
  });

  it("leaves an unsupplied placeholder visible rather than printing undefined", () => {
    const t = createTranslator("en");
    expect(t("popup.statusOn", {})).toContain("{date}");
  });
});

describe("formatDate", () => {
  it("formats in the target language", () => {
    expect(formatDate("2012-08-12", "ja")).toBe("2012年8月12日");
    expect(formatDate("2012-08-12", "en")).toBe("12 August 2012");
    expect(formatDate("2012-08-12", "de")).toContain("2012");
  });

  it("does not shift the day through the local timezone", () => {
    // Built in UTC: west of Greenwich a local projection would print the 11th.
    for (const language of ["en", "ja", "zh", "ko", "es", "de"] as const) {
      expect(formatDate("2012-08-12", language), language).toMatch(/12/);
    }
  });

  it("passes unparseable input through", () => {
    expect(formatDate("nonsense", "en")).toBe("nonsense");
  });
});
