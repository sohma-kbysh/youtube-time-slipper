// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import type { Settings } from "../src/core/types";
import { defaultSettings } from "../src/storage/settings";
import {
  ROOT_ACTIVE_ATTR,
  ROOT_UNKNOWN_ATTR,
  STATE_ATTR,
  applyCardState,
  applyRootFlags,
  clearRootFlags,
  countStates,
  getTracked,
  resetAllCards,
  resetCard
} from "../src/content/visibility";

const ID = "AAAAAAAAAAA";

function settingsWith(patch: Partial<Settings> = {}): Settings {
  return { ...defaultSettings(), enabled: true, virtualDate: "2012-08-12", ...patch };
}

function card(): HTMLElement {
  const element = document.createElement("ytd-rich-item-renderer");
  document.body.appendChild(element);
  return element;
}

beforeEach(() => {
  document.body.innerHTML = "";
  clearRootFlags();
});

describe("applyCardState", () => {
  it("records the state on the element and in the tracker", () => {
    const element = card();
    applyCardState(element, ID, "future");

    expect(element.getAttribute(STATE_ATTR)).toBe("future");
    expect(getTracked(element)).toEqual({ videoId: ID, state: "future" });
  });

  it("overwrites the verdict when the element is reused for another video", () => {
    const element = card();
    applyCardState(element, ID, "visible");
    applyCardState(element, "BBBBBBBBBBB", "future");

    expect(element.getAttribute(STATE_ATTR)).toBe("future");
  });

  it("hides a renderer explicitly classified as a duplicate", () => {
    const primary = card();
    const repeated = card();

    applyCardState(primary, ID, "visible");
    applyCardState(repeated, ID, "duplicate");

    expect(getTracked(primary)?.state).toBe("visible");
    expect(getTracked(repeated)?.state).toBe("duplicate");
    expect(repeated.getAttribute(STATE_ATTR)).toBe("duplicate");
  });

  it("restores a duplicate state when it is reclassified as visible", () => {
    const primary = card();
    const repeated = card();

    applyCardState(primary, ID, "visible");
    applyCardState(repeated, ID, "duplicate");
    primary.remove();
    applyCardState(repeated, ID, "visible");

    expect(getTracked(repeated)?.state).toBe("visible");
  });

  it("does not conflate different video ids", () => {
    const first = card();
    const second = card();

    applyCardState(first, ID, "visible");
    applyCardState(second, "BBBBBBBBBBB", "visible");

    expect(getTracked(first)?.state).toBe("visible");
    expect(getTracked(second)?.state).toBe("visible");
  });
});

describe("resetting", () => {
  it("leaves no trace on a single card", () => {
    const element = card();
    applyCardState(element, ID, "future");
    resetCard(element);

    expect(element.hasAttribute(STATE_ATTR)).toBe(false);
    expect(getTracked(element)).toBeUndefined();
  });

  it("leaves no trace on the whole page when the extension is switched off", () => {
    for (const state of ["pending", "visible", "future", "unknown"] as const) {
      applyCardState(card(), ID, state);
    }

    applyRootFlags(settingsWith(), true);
    resetAllCards();
    clearRootFlags();

    expect(document.querySelectorAll(`[${STATE_ATTR}]`)).toHaveLength(0);
    expect(document.documentElement.hasAttribute(ROOT_ACTIVE_ATTR)).toBe(false);
    expect(document.documentElement.hasAttribute(ROOT_UNKNOWN_ATTR)).toBe(false);
  });
});

describe("applyRootFlags", () => {
  it("publishes the unknown policy so CSS can react without a rescan", () => {
    applyRootFlags(settingsWith({ unknownPolicy: "hide" }), true);
    expect(document.documentElement.getAttribute(ROOT_ACTIVE_ATTR)).toBe("on");
    expect(document.documentElement.getAttribute(ROOT_UNKNOWN_ATTR)).toBe("hide");

    applyRootFlags(settingsWith({ unknownPolicy: "show" }), true);
    expect(document.documentElement.getAttribute(ROOT_UNKNOWN_ATTR)).toBe("show");
  });

  it("removes the flags when inactive", () => {
    applyRootFlags(settingsWith(), true);
    applyRootFlags(settingsWith({ enabled: false }), false);

    expect(document.documentElement.hasAttribute(ROOT_ACTIVE_ATTR)).toBe(false);
  });
});

describe("countStates", () => {
  it("tallies the page for the debug log", () => {
    applyCardState(card(), ID, "visible");
    applyCardState(card(), "BBBBBBBBBBB", "future");
    applyCardState(card(), ID, "duplicate");

    expect(countStates()).toEqual({
      pending: 0,
      visible: 1,
      future: 1,
      before: 0,
      unknown: 0,
      duplicate: 1
    });
  });
});
