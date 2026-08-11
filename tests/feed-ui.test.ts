// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://www.youtube.com/" }

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderDiscovery, removeDiscovery } from "../src/content/discover";
import { renderEmptyState, removeEmptyState } from "../src/content/empty-state";
import { FEED_UI_HOST_CLASS } from "../src/content/feed-ui";
import { createTranslator } from "../src/core/i18n";

const t = createTranslator("en");

function installFeed(): HTMLElement {
  document.body.innerHTML = `
    <main id="page">
      <ytd-rich-grid-renderer id="feed-renderer">
        <div id="contents"></div>
      </ytd-rich-grid-renderer>
    </main>
  `;
  return document.querySelector<HTMLElement>("#feed-renderer")!;
}

function emptyModel() {
  return {
    status: "loading" as const,
    visible: 1,
    total: 20,
    virtualDate: "2012-08-12" as const
  };
}

async function mutationsFrom(action: () => void): Promise<MutationRecord[]> {
  const records: MutationRecord[] = [];
  const observer = new MutationObserver((next) => records.push(...next));
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true
  });

  action();
  await Promise.resolve();
  observer.disconnect();
  return records;
}

beforeEach(() => {
  removeEmptyState();
  removeDiscovery();
  installFeed();
});

afterEach(() => {
  removeEmptyState();
  removeDiscovery();
  document.body.textContent = "";
});

describe("shared feed UI host", () => {
  it("mounts beside the feed renderer rather than inside YouTube's #contents", () => {
    const renderer = document.querySelector<HTMLElement>("#feed-renderer")!;

    renderEmptyState(emptyModel(), t);

    const host = document.querySelector<HTMLElement>(`.${FEED_UI_HOST_CLASS}`)!;
    expect(host.parentElement).toBe(renderer.parentElement);
    expect(host.nextElementSibling).toBe(renderer);
    expect(renderer.querySelector(`.${FEED_UI_HOST_CLASS}`)).toBeNull();
    expect(renderer.querySelector(".time-slipper-empty")).toBeNull();
    expect(host.querySelector(".time-slipper-empty")).not.toBeNull();
  });

  it("prefers a recognised feed over an earlier unrelated #contents", () => {
    document.querySelector("#page")?.insertAdjacentHTML(
      "beforebegin",
      '<nav id="decoy"><div id="contents"></div></nav>'
    );
    const renderer = document.querySelector<HTMLElement>("#feed-renderer")!;

    renderEmptyState(emptyModel(), t);

    const host = document.querySelector<HTMLElement>(`.${FEED_UI_HOST_CLASS}`)!;
    expect(host.parentElement).toBe(renderer.parentElement);
    expect(document.querySelector("#decoy")?.contains(host)).toBe(false);
  });

  it("prefers the active feed over a retained hidden feed", () => {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<section hidden>
        <ytd-rich-grid-renderer id="old-feed"><div id="contents"></div></ytd-rich-grid-renderer>
      </section>`
    );
    const renderer = document.querySelector<HTMLElement>("#feed-renderer")!;

    renderEmptyState(emptyModel(), t);

    const host = document.querySelector<HTMLElement>(`.${FEED_UI_HOST_CLASS}`)!;
    expect(host.nextElementSibling).toBe(renderer);
    expect(document.querySelector("#old-feed")?.parentElement?.contains(host)).toBe(false);
  });

  it("shares one host and releases it only after both consumers leave", () => {
    renderEmptyState(emptyModel(), t);
    renderDiscovery({ status: "searching" }, t);

    const host = document.querySelector<HTMLElement>(`.${FEED_UI_HOST_CLASS}`)!;
    expect(document.querySelectorAll(`.${FEED_UI_HOST_CLASS}`)).toHaveLength(1);
    expect(host.querySelector(".time-slipper-empty")).not.toBeNull();
    expect(host.querySelector(".time-slipper-discover")).not.toBeNull();

    removeEmptyState();
    expect(document.querySelector(`.${FEED_UI_HOST_CLASS}`)).toBe(host);
    expect(host.querySelector(".time-slipper-discover")).not.toBeNull();

    removeDiscovery();
    expect(document.querySelector(`.${FEED_UI_HOST_CLASS}`)).toBeNull();
  });

  it("moves the stable UI to a replacement feed without recreating its panel", () => {
    renderEmptyState(emptyModel(), t);
    const panel = document.querySelector<HTMLElement>(".time-slipper-empty")!;

    document.body.innerHTML = "";
    const renderer = installFeed();
    renderEmptyState(emptyModel(), t);

    expect(document.querySelector(".time-slipper-empty")).toBe(panel);
    expect(panel.parentElement?.classList.contains(FEED_UI_HOST_CLASS)).toBe(true);
    expect(panel.parentElement?.nextElementSibling).toBe(renderer);
  });
});

describe("idempotent feed UI rendering", () => {
  it("uses a compact loading heading and hides actions that cannot run", () => {
    renderEmptyState(emptyModel(), t);

    const panel = document.querySelector<HTMLElement>(".time-slipper-empty")!;
    const button = panel.querySelector<HTMLButtonElement>("button")!;
    expect(panel.querySelector(".time-slipper-empty__title")?.textContent)
      .toBe("Checking publication dates…");
    expect(panel.getAttribute("aria-busy")).toBe("true");
    expect(button.disabled).toBe(true);
    expect(button.hidden).toBe(true);
  });

  it("shows the load action again once loading is exhausted", () => {
    renderEmptyState({ ...emptyModel(), status: "exhausted" }, t);

    const button = document.querySelector<HTMLButtonElement>(
      ".time-slipper-empty__button"
    )!;
    expect(button.disabled).toBe(false);
    expect(button.hidden).toBe(false);
  });

  it("does not mutate the empty-state panel when its model is unchanged", async () => {
    renderEmptyState(emptyModel(), t);
    const panel = document.querySelector(".time-slipper-empty");

    const records = await mutationsFrom(() => renderEmptyState(emptyModel(), t));

    expect(document.querySelector(".time-slipper-empty")).toBe(panel);
    expect(records).toHaveLength(0);
  });

  it("keeps historical cards untouched when equivalent results render again", async () => {
    const state = {
      status: "results" as const,
      source: "api" as const,
      videos: [{
        videoId: "AAAAAAAAAAA",
        title: "Old video",
        publishedDate: "2011-04-03" as const,
        channelTitle: "Archive"
      }]
    };
    renderDiscovery(state, t);
    const card = document.querySelector(".time-slipper-discover__card");

    const records = await mutationsFrom(() => renderDiscovery({ ...state }, t));

    expect(document.querySelector(".time-slipper-discover__card")).toBe(card);
    expect(records).toHaveLength(0);
  });
});
