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

  it("keeps a start date that sits inside the window", () => {
    const normalized = normalizeSettings(
      { virtualDate: "2012-08-12", rangeStart: "2010-01-01" },
      now
    );
    expect(normalized.rangeStart).toBe("2010-01-01");
  });

  it("drops a start date later than the virtual present", () => {
    // Keeping it would hide every video, which is never what was meant.
    const normalized = normalizeSettings(
      { virtualDate: "2012-08-12", rangeStart: "2015-01-01" },
      now
    );
    expect(normalized.rangeStart).toBeNull();
  });

  it("drops a malformed start date", () => {
    expect(normalizeSettings({ rangeStart: "2012-99-99" }, now).rangeStart).toBeNull();
    expect(normalizeSettings({ rangeStart: 5 }, now).rangeStart).toBeNull();
  });

  it("clamps the refill numbers into a usable range", () => {
    expect(normalizeSettings({ fillTargetVisible: 0 }, now).fillTargetVisible).toBe(5);
    expect(normalizeSettings({ fillTargetVisible: 9999 }, now).fillTargetVisible).toBe(
      200
    );
    expect(normalizeSettings({ fillMaxRounds: -3 }, now).fillMaxRounds).toBe(1);
    expect(normalizeSettings({ fillMaxRounds: 100000 }, now).fillMaxRounds).toBe(300);
    expect(normalizeSettings({ fillTargetVisible: 33.6 }, now).fillTargetVisible).toBe(
      34
    );
  });

  it("falls back for unusable refill numbers", () => {
    expect(normalizeSettings({ fillTargetVisible: "many" }, now).fillTargetVisible).toBe(
      20
    );
    expect(normalizeSettings({ fillMaxRounds: NaN }, now).fillMaxRounds).toBe(25);
  });

  it("keeps only string feature ids", () => {
    expect(
      normalizeSettings({ allowedFeatures: ["shorts", 7, null, "playables"] }, now)
        .allowedFeatures
    ).toEqual(["shorts", "playables"]);
    expect(normalizeSettings({ allowedFeatures: "shorts" }, now).allowedFeatures).toEqual(
      []
    );
  });

  it("hides anachronistic features by default", () => {
    expect(defaultSettings().hideFutureFeatures).toBe(true);
    expect(defaultSettings().rangeStart).toBeNull();
  });

  it("fills in surfaces added by a later version", () => {
    const legacy = { surfaces: { home: false } };
    const normalized = normalizeSettings(legacy, now);

    expect(normalized.surfaces.home).toBe(false);
    expect(normalized.surfaces.playlists).toBe(true);
  });
});
