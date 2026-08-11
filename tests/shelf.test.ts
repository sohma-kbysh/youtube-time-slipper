// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import type { CardState } from "../src/core/types";
import {
  SHELF_ATTR,
  collapseEmptyShelves,
  countVisibleCards,
  isHiddenState,
  resetShelves
} from "../src/content/shelf";
import { STATE_ATTR } from "../src/content/visibility";

const STRICT = { unknownPolicy: "hide" } as const;
const RELAXED = { unknownPolicy: "show" } as const;

function shelf(id: string, states: CardState[]): void {
  const element = document.createElement("ytd-rich-shelf-renderer");
  element.id = id;

  for (const state of states) {
    const card = document.createElement("ytd-rich-item-renderer");
    card.setAttribute(STATE_ATTR, state);
    element.appendChild(card);
  }

  document.body.appendChild(element);
}

function isCollapsed(id: string): boolean {
  return document.querySelector(`#${id}`)?.getAttribute(SHELF_ATTR) === "empty";
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("isHiddenState", () => {
  it("mirrors the stylesheet", () => {
    expect(isHiddenState("future", STRICT)).toBe(true);
    expect(isHiddenState("pending", STRICT)).toBe(true);
    expect(isHiddenState("duplicate", RELAXED)).toBe(true);
    expect(isHiddenState("visible", STRICT)).toBe(false);
    expect(isHiddenState("unknown", STRICT)).toBe(true);
    expect(isHiddenState("unknown", RELAXED)).toBe(false);
    expect(isHiddenState(null, STRICT)).toBe(false);
  });
});

describe("collapseEmptyShelves", () => {
  it("hides a shelf whose videos are all filtered out", () => {
    shelf("gone", ["future", "future", "future"]);

    expect(collapseEmptyShelves(STRICT).collapsed).toBe(1);
    expect(isCollapsed("gone")).toBe(true);
  });

  it("keeps a shelf with even one survivor", () => {
    shelf("kept", ["future", "visible", "future"]);

    collapseEmptyShelves(STRICT);
    expect(isCollapsed("kept")).toBe(false);
  });

  it("hides a shelf that is still resolving, then reveals it when it clears", () => {
    // Pending counts as hidden, so a shelf does not flash into view half-built.
    shelf("later", ["pending", "pending"]);
    collapseEmptyShelves(STRICT);
    expect(isCollapsed("later")).toBe(true);

    document
      .querySelector("#later ytd-rich-item-renderer")!
      .setAttribute(STATE_ATTR, "visible");

    collapseEmptyShelves(STRICT);
    expect(isCollapsed("later")).toBe(false);
  });

  it("follows the unknown policy", () => {
    shelf("undated", ["unknown", "unknown"]);

    collapseEmptyShelves(STRICT);
    expect(isCollapsed("undated")).toBe(true);

    collapseEmptyShelves(RELAXED);
    expect(isCollapsed("undated")).toBe(false);
  });

  it("leaves shelves that hold no videos alone", () => {
    // A news shelf of articles, a community post: never ours to hide.
    const news = document.createElement("ytd-rich-section-renderer");
    news.id = "news";
    news.innerHTML = "<p>Breaking news</p>";
    document.body.appendChild(news);

    collapseEmptyShelves(STRICT);
    expect(document.querySelector("#news")?.hasAttribute(SHELF_ATTR)).toBe(false);
  });

  it("is reversible", () => {
    shelf("gone", ["future"]);
    collapseEmptyShelves(STRICT);
    resetShelves();

    expect(document.querySelectorAll(`[${SHELF_ATTR}]`)).toHaveLength(0);
  });
});

describe("countVisibleCards", () => {
  it("counts what the user can actually see", () => {
    shelf("a", ["visible", "future", "unknown", "pending"]);

    expect(countVisibleCards(STRICT)).toEqual({ visible: 1, total: 4 });
    expect(countVisibleCards(RELAXED)).toEqual({ visible: 2, total: 4 });
  });

  it("reports zero on an empty page", () => {
    expect(countVisibleCards(STRICT)).toEqual({ visible: 0, total: 0 });
  });

  it("does not count duplicate renderers as feed inventory", () => {
    shelf("duplicates", ["visible", "duplicate", "future"]);

    expect(countVisibleCards(STRICT)).toEqual({ visible: 1, total: 2 });
  });
});
