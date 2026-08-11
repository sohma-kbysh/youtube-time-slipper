import { describe, expect, it } from "vitest";

import { CONFIGURABLE_SURFACES, defaultSettings, normalizeSettings } from "../src/storage/settings";

describe("defaults", () => {
  it("ships disabled, so installing changes nothing until the user decides", () => {
    expect(defaultSettings().enabled).toBe(false);
  });

  it("fails closed on undated videos", () => {
    expect(defaultSettings().unknownPolicy).toBe("hide");
  });

  it("filters every surface by default", () => {
    const surfaces = defaultSettings().surfaces;
    for (const surface of CONFIGURABLE_SURFACES) {
      expect(surfaces[surface], surface).toBe(true);
    }
  });

  it("starts at today, which filters nothing", () => {
    expect(defaultSettings(new Date(2026, 7, 12)).virtualDate).toBe("2026-08-12");
  });
});

describe("normalizeSettings", () => {
  const now = new Date(2026, 7, 12);

  it("passes a well-formed object through", () => {
    const stored = {
      enabled: true,
      virtualDate: "2012-08-12",
      unknownPolicy: "show",
      showTimelineBadge: false,
      surfaces: { ...defaultSettings().surfaces, shorts: false }
    };

    const normalized = normalizeSettings(stored, now);
    expect(normalized.enabled).toBe(true);
    expect(normalized.virtualDate).toBe("2012-08-12");
    expect(normalized.unknownPolicy).toBe("show");
    expect(normalized.surfaces.shorts).toBe(false);
  });

  it("replaces a corrupt virtual date rather than disabling filtering", () => {
    expect(normalizeSettings({ virtualDate: "2012-99-99" }, now).virtualDate).toBe(
      "2026-08-12"
    );
    expect(normalizeSettings({ virtualDate: 20120812 }, now).virtualDate).toBe(
      "2026-08-12"
    );
  });

  it("falls back to the strict policy for an unrecognised unknownPolicy", () => {
    expect(normalizeSettings({ unknownPolicy: "whatever" }, now).unknownPolicy).toBe(
      "hide"
    );
    expect(normalizeSettings({}, now).unknownPolicy).toBe("hide");
  });

  it("survives garbage", () => {
    for (const value of [null, undefined, 42, "settings", [], { surfaces: 7 }]) {
      const normalized = normalizeSettings(value, now);
      expect(normalized.virtualDate).toBe("2026-08-12");
      expect(normalized.surfaces.home).toBe(true);
    }
  });

  it("fills in surfaces added by a later version", () => {
    const legacy = { surfaces: { home: false } };
    const normalized = normalizeSettings(legacy, now);

    expect(normalized.surfaces.home).toBe(false);
    expect(normalized.surfaces.playlists).toBe(true);
  });
});
