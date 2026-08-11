// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { isValidCalendarDate } from "../src/core/date";
import type { Settings } from "../src/core/types";
import {
  ERA_ATTR,
  ERA_FEATURES,
  anachronisticFeatures,
  applyEraFeatures,
  resetEraFeatures
} from "../src/content/era";
import { defaultSettings } from "../src/storage/settings";

function settingsWith(patch: Partial<Settings> = {}): Settings {
  return {
    ...defaultSettings(),
    enabled: true,
    virtualDate: "2012-08-12",
    hideFutureFeatures: true,
    allowedFeatures: [],
    ...patch
  };
}

function eraOf(selector: string): string | null {
  return document.querySelector(selector)?.getAttribute(ERA_ATTR) ?? null;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("the feature table", () => {
  it("gives every feature a valid launch date and a unique id", () => {
    const ids = new Set<string>();

    for (const feature of ERA_FEATURES) {
      expect(isValidCalendarDate(feature.since), feature.id).toBe(true);
      expect(feature.label.length, feature.id).toBeGreaterThan(0);
      expect(ids.has(feature.id), `duplicate id ${feature.id}`).toBe(false);
      ids.add(feature.id);
    }
  });

  it("gives every feature something to match on", () => {
    for (const feature of ERA_FEATURES) {
      const matchers = (feature.elements?.length ?? 0) + (feature.links?.length ?? 0);
      expect(matchers, feature.id).toBeGreaterThan(0);
    }
  });

  it("covers the features that prompted this", () => {
    const ids = ERA_FEATURES.map((feature) => feature.id);
    expect(ids).toContain("shorts");
    expect(ids).toContain("playables");
  });
});

describe("anachronisticFeatures", () => {
  it("selects only what launched after the virtual present", () => {
    const ids = anachronisticFeatures(settingsWith({ virtualDate: "2012-08-12" })).map(
      (feature) => feature.id
    );

    expect(ids).toContain("shorts"); // 2020
    expect(ids).toContain("playables"); // 2024
    expect(ids).not.toContain("liveStreaming"); // 2011
    expect(ids).not.toContain("movies"); // 2011
  });

  it("treats a feature launched on the day itself as existing", () => {
    const ids = anachronisticFeatures(settingsWith({ virtualDate: "2020-09-14" })).map(
      (feature) => feature.id
    );

    expect(ids).not.toContain("shorts");
  });

  it("selects nothing when the virtual present is today", () => {
    expect(anachronisticFeatures(settingsWith({ virtualDate: "2026-08-12" }))).toEqual(
      []
    );
  });

  it("respects features the user chose to keep", () => {
    const ids = anachronisticFeatures(
      settingsWith({ allowedFeatures: ["shorts"] })
    ).map((feature) => feature.id);

    expect(ids).not.toContain("shorts");
    expect(ids).toContain("playables");
  });

  it("selects nothing when the whole option is off", () => {
    expect(anachronisticFeatures(settingsWith({ hideFutureFeatures: false }))).toEqual(
      []
    );
  });
});

describe("applyEraFeatures", () => {
  it("hides the sidebar entry for a feature that did not exist", () => {
    document.body.innerHTML = `
      <ytd-guide-entry-renderer id="shorts-entry">
        <a href="/shorts" title="Shorts">Shorts</a>
      </ytd-guide-entry-renderer>
      <ytd-guide-entry-renderer id="subs-entry">
        <a href="/feed/subscriptions">Subscriptions</a>
      </ytd-guide-entry-renderer>
    `;

    applyEraFeatures(settingsWith());

    expect(eraOf("#shorts-entry")).toBe("shorts");
    expect(eraOf("#subs-entry")).toBeNull();
  });

  it("hides the Playables entry, in both its relative and absolute forms", () => {
    document.body.innerHTML = `
      <ytd-guide-entry-renderer id="relative">
        <a href="/playables">Playables</a>
      </ytd-guide-entry-renderer>
      <ytd-mini-guide-entry-renderer id="absolute">
        <a href="https://www.youtube.com/playables">Playables</a>
      </ytd-mini-guide-entry-renderer>
    `;

    applyEraFeatures(settingsWith());

    expect(eraOf("#relative")).toBe("playables");
    expect(eraOf("#absolute")).toBe("playables");
  });

  it("hides whole Shorts shelves, not just their links", () => {
    document.body.innerHTML = `
      <ytd-reel-shelf-renderer id="shelf"></ytd-reel-shelf-renderer>
      <ytd-rich-shelf-renderer id="rich" is-shorts></ytd-rich-shelf-renderer>
    `;

    applyEraFeatures(settingsWith());

    expect(eraOf("#shelf")).toBe("shorts");
    expect(eraOf("#rich")).toBe("shorts");
  });

  it("hides the topic chip bar for a pre-2019 timeline", () => {
    document.body.innerHTML =
      '<ytd-feed-filter-chip-bar-renderer id="chips"></ytd-feed-filter-chip-bar-renderer>';

    applyEraFeatures(settingsWith({ virtualDate: "2012-08-12" }));
    expect(eraOf("#chips")).toBe("filterChips");

    applyEraFeatures(settingsWith({ virtualDate: "2022-01-12" }));
    expect(eraOf("#chips")).toBeNull();
  });

  it("un-hides a feature when the virtual date moves past its launch", () => {
    document.body.innerHTML = `
      <ytd-guide-entry-renderer id="shorts-entry">
        <a href="/shorts">Shorts</a>
      </ytd-guide-entry-renderer>
    `;

    applyEraFeatures(settingsWith({ virtualDate: "2012-08-12" }));
    expect(eraOf("#shorts-entry")).toBe("shorts");

    applyEraFeatures(settingsWith({ virtualDate: "2024-01-01" }));
    expect(eraOf("#shorts-entry")).toBeNull();
  });

  it("keeps a feature the user opted back in", () => {
    document.body.innerHTML = `
      <ytd-guide-entry-renderer id="shorts-entry">
        <a href="/shorts">Shorts</a>
      </ytd-guide-entry-renderer>
    `;

    applyEraFeatures(settingsWith({ allowedFeatures: ["shorts"] }));
    expect(eraOf("#shorts-entry")).toBeNull();
  });

  it("does nothing at all when the option is off", () => {
    document.body.innerHTML = `
      <ytd-reel-shelf-renderer id="shelf"></ytd-reel-shelf-renderer>
    `;

    const result = applyEraFeatures(settingsWith({ hideFutureFeatures: false }));

    expect(result.hidden).toBe(0);
    expect(eraOf("#shelf")).toBeNull();
  });

  it("is fully reversible", () => {
    document.body.innerHTML = `
      <ytd-reel-shelf-renderer id="shelf"></ytd-reel-shelf-renderer>
      <ytd-guide-entry-renderer id="entry"><a href="/playables">P</a></ytd-guide-entry-renderer>
    `;

    applyEraFeatures(settingsWith());
    resetEraFeatures();

    expect(document.querySelectorAll(`[${ERA_ATTR}]`)).toHaveLength(0);
  });

  it("does not hide the surrounding page when a link is loose", () => {
    // No recognised entry wrapper: only the link itself should go, never an
    // arbitrary ancestor.
    document.body.innerHTML = `
      <div id="wrapper"><a id="link" href="/playables">Playables</a></div>
    `;

    applyEraFeatures(settingsWith());

    expect(eraOf("#link")).toBe("playables");
    expect(eraOf("#wrapper")).toBeNull();
  });
});
