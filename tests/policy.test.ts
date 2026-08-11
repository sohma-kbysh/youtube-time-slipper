import { describe, expect, it } from "vitest";

import {
  classifyVideo,
  decideCardState,
  isActive,
  isSurfaceEnabled,
  shouldHide
} from "../src/core/policy";
import type { Settings } from "../src/core/types";
import { defaultSettings } from "../src/storage/settings";

function settingsWith(patch: Partial<Settings> = {}): Settings {
  return { ...defaultSettings(), enabled: true, virtualDate: "2012-08-12", ...patch };
}

describe("classifyVideo", () => {
  const settings = settingsWith();

  it("shows videos published before the virtual present", () => {
    expect(classifyVideo("2008-04-03", settings)).toBe("visible");
    expect(classifyVideo("2012-08-11", settings)).toBe("visible");
  });

  it("shows a video published on the virtual date (inclusive boundary)", () => {
    expect(classifyVideo("2012-08-12", settings)).toBe("visible");
  });

  it("hides videos published after the virtual present", () => {
    expect(classifyVideo("2012-08-13", settings)).toBe("future");
    expect(classifyVideo("2026-08-12", settings)).toBe("future");
  });

  it("treats an undated video as unknown, never as visible", () => {
    expect(classifyVideo(null, settings)).toBe("unknown");
  });

  it("treats an unparseable date as unknown rather than ignoring the filter", () => {
    expect(classifyVideo("2 years ago", settings)).toBe("unknown");
    expect(classifyVideo("2012-99-99", settings)).toBe("unknown");
  });

  it("does not fail open when the virtual date itself is corrupt", () => {
    const corrupt = settingsWith({ virtualDate: "not-a-date" });
    expect(classifyVideo("2008-01-01", corrupt)).toBe("unknown");
  });
});

describe("classifyVideo with a period", () => {
  const settings = settingsWith({
    rangeStart: "2010-01-01",
    virtualDate: "2012-08-12"
  });

  it("shows videos inside the window, including both edges", () => {
    expect(classifyVideo("2010-01-01", settings)).toBe("visible");
    expect(classifyVideo("2011-06-15", settings)).toBe("visible");
    expect(classifyVideo("2012-08-12", settings)).toBe("visible");
  });

  it("hides videos on either side of the window", () => {
    expect(classifyVideo("2009-12-31", settings)).toBe("before");
    expect(classifyVideo("2012-08-13", settings)).toBe("future");
  });

  it("ignores a malformed lower bound rather than hiding everything", () => {
    const broken = settingsWith({ rangeStart: "not-a-date" });
    expect(classifyVideo("2008-01-01", broken)).toBe("visible");
  });

  it("treats no lower bound as no lower bound", () => {
    const open = settingsWith({ rangeStart: null });
    expect(classifyVideo("2006-01-01", open)).toBe("visible");
  });
});

describe("shouldHide", () => {
  it("hides pending cards so future videos never flash on screen", () => {
    expect(shouldHide("pending", { unknownPolicy: "hide" })).toBe(true);
    expect(shouldHide("pending", { unknownPolicy: "show" })).toBe(true);
  });

  it("always hides future videos", () => {
    expect(shouldHide("future", { unknownPolicy: "hide" })).toBe(true);
    expect(shouldHide("future", { unknownPolicy: "show" })).toBe(true);
  });

  it("never hides videos that were cleared", () => {
    expect(shouldHide("visible", { unknownPolicy: "hide" })).toBe(false);
  });

  it("hides videos from before the window", () => {
    expect(shouldHide("before", { unknownPolicy: "hide" })).toBe(true);
    expect(shouldHide("before", { unknownPolicy: "show" })).toBe(true);
  });

  it("follows the unknown policy for undated videos", () => {
    expect(shouldHide("unknown", { unknownPolicy: "hide" })).toBe(true);
    expect(shouldHide("unknown", { unknownPolicy: "show" })).toBe(false);
  });
});

describe("decideCardState", () => {
  const settings = settingsWith();

  it("distinguishes 'not resolved yet' from 'resolved to nothing'", () => {
    expect(decideCardState(undefined, settings)).toBe("pending");
    expect(decideCardState(null, settings)).toBe("unknown");
  });

  it("classifies resolved dates", () => {
    expect(decideCardState("2011-01-01", settings)).toBe("visible");
    expect(decideCardState("2013-01-01", settings)).toBe("future");
  });
});

describe("isSurfaceEnabled", () => {
  it("respects per-surface toggles", () => {
    const settings = settingsWith({
      surfaces: { ...defaultSettings().surfaces, search: false }
    });

    expect(isSurfaceEnabled("home", settings)).toBe(true);
    expect(isSurfaceEnabled("search", settings)).toBe(false);
  });

  it("filters unrecognised surfaces rather than exempting them", () => {
    const settings = settingsWith();
    expect(isSurfaceEnabled("other", settings)).toBe(true);
  });
});

describe("isActive", () => {
  it("requires both the switch and a usable date", () => {
    expect(isActive(settingsWith())).toBe(true);
    expect(isActive(settingsWith({ enabled: false }))).toBe(false);
    expect(isActive(settingsWith({ virtualDate: "" }))).toBe(false);
  });
});

describe("the core invariant", () => {
  it("never reports a video newer than the virtual date as visible", () => {
    const settings = settingsWith({ virtualDate: "2015-06-15" });

    // Sweep every day of a decade around the boundary.
    for (let offset = -2000; offset <= 2000; offset += 1) {
      const date = new Date(Date.UTC(2015, 5, 15));
      date.setUTCDate(date.getUTCDate() + offset);
      const candidate = date.toISOString().slice(0, 10);

      const state = classifyVideo(candidate, settings);
      const isNewer = candidate > settings.virtualDate;

      expect(state === "visible", `${candidate} -> ${state}`).toBe(!isNewer);
      if (isNewer) {
        expect(shouldHide(state, settings)).toBe(true);
      }
    }
  });
});
