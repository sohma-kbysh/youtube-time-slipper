// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://www.youtube.com/" }

/**
 * End-to-end exercise of the content script against a stubbed Chrome API.
 *
 * The unit tests cover each subsystem; this one covers the wiring between
 * them, which is where a filter extension actually fails — a correct policy
 * that is never applied to the DOM looks exactly like no extension at all.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MESSAGE_DISCOVER_ERA,
  MESSAGE_ERA_DISCOVERED,
  MESSAGE_RESOLVE_ERROR,
  MESSAGE_RESOLVE_VIDEO_DATES,
  MESSAGE_VIDEO_DATES_RESOLVED,
  type ExtensionRequest,
  type ResolveVideoDatesRequest
} from "../src/core/messages";
import type { PublicationResolution, Settings, VideoId } from "../src/core/types";
import { STATE_ATTR } from "../src/content/visibility";

const OLD_VIDEO = "AAAAAAAAAAA";
const NEW_VIDEO = "BBBBBBBBBBB";
const UNDATED_VIDEO = "CCCCCCCCCCC";
const APPENDED_VIDEO = "FFFFFFFFFFF";
const RECYCLED_VIDEO = "GGGGGGGGGGG";

const DATES: Record<VideoId, string | null> = {
  [OLD_VIDEO]: "2008-04-03",
  [NEW_VIDEO]: "2018-03-01",
  [UNDATED_VIDEO]: null,
  [APPENDED_VIDEO]: "2019-04-01",
  [RECYCLED_VIDEO]: "2020-05-02"
};

interface StorageListener {
  (changes: Record<string, { newValue?: unknown }>, areaName: string): void;
}

let storage: Record<string, unknown>;
let storageListeners: StorageListener[];
let sendMessage: ReturnType<typeof vi.fn>;

const DEFAULT_HISTORICAL_VIDEOS = [
  {
    videoId: "DDDDDDDDDDD",
    title: "A video from the era",
    publishedDate: "2009-07-07"
  },
  {
    videoId: "EEEEEEEEEEE",
    title: "Another from the era",
    publishedDate: "2011-02-02"
  }
];

function installChromeStub(
  initial: Partial<Settings>,
  historicalVideos: typeof DEFAULT_HISTORICAL_VIDEOS | Promise<typeof DEFAULT_HISTORICAL_VIDEOS> =
    DEFAULT_HISTORICAL_VIDEOS,
  resolutionOptions: {
    gate?: Promise<void>;
    status?: "html-rate-limited";
    failuresBeforeSuccess?: number;
  } = {}
): void {
  storage = { settings: initial };
  storageListeners = [];
  let resolutionFailuresRemaining = resolutionOptions.failuresBeforeSuccess ?? 0;

  // The stub answers both request types, so it is typed as the union the
  // content script actually sends.
  sendMessage = vi.fn(async (request: ExtensionRequest) => {
    if (request.type !== MESSAGE_DISCOVER_ERA && request.type !== MESSAGE_RESOLVE_VIDEO_DATES) {
      return { type: MESSAGE_RESOLVE_ERROR, message: "unsupported in stub" };
    }

    if (request.type === MESSAGE_DISCOVER_ERA) {
      const resolvedVideos = await historicalVideos;
      return {
        type: MESSAGE_ERA_DISCOVERED,
        source: resolvedVideos.length > 0 ? "api" : "none",
        exhausted: resolvedVideos.length < request.limit,
        videos: resolvedVideos.slice(0, request.limit)
      };
    }

    await resolutionOptions.gate;

    if (resolutionFailuresRemaining > 0) {
      resolutionFailuresRemaining -= 1;
      throw new Error("temporary resolver failure");
    }

    const results: Record<VideoId, PublicationResolution> = {};

    for (const videoId of request.videoIds) {
      results[videoId] = {
        videoId,
        publishedDate: DATES[videoId] ?? null,
        source: "youtube-html",
        confidence: DATES[videoId] ? "exact-day" : "unknown",
        resolvedAt: Date.now()
      };
    }

    return {
      type: MESSAGE_VIDEO_DATES_RESOLVED,
      results,
      ...(resolutionOptions.status
        ? { resolverStatus: resolutionOptions.status }
        : {})
    };
  });

  (globalThis as Record<string, unknown>)["chrome"] = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: storage[key] }),
        set: async (items: Record<string, unknown>) => {
          Object.assign(storage, items);
          const changes: Record<string, { newValue?: unknown }> = {};
          for (const [key, value] of Object.entries(items)) {
            changes[key] = { newValue: value };
          }
          for (const listener of storageListeners) listener(changes, "local");
        }
      },
      onChanged: {
        addListener: (listener: StorageListener) => storageListeners.push(listener),
        removeListener: (listener: StorageListener) => {
          storageListeners = storageListeners.filter((entry) => entry !== listener);
        }
      }
    },
    runtime: {
      sendMessage,
      onMessage: { addListener: () => {} },
      onInstalled: { addListener: () => {} }
    }
  };
}

/** Let the boot promise, the message round trip and the debounce all land. */
let settleWithFakeTimers = false;

async function settle(): Promise<void> {
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
    if (settleWithFakeTimers) {
      await vi.advanceTimersByTimeAsync(20);
    } else {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

function feed(): string {
  return `
    <ytd-rich-item-renderer id="old">
      <a href="/watch?v=${OLD_VIDEO}">old</a>
      <div id="metadata-line">18 years ago</div>
    </ytd-rich-item-renderer>
    <ytd-rich-item-renderer id="new">
      <a href="/watch?v=${NEW_VIDEO}">new</a>
      <div id="metadata-line">8 years ago</div>
    </ytd-rich-item-renderer>
    <ytd-rich-item-renderer id="undated">
      <a href="/watch?v=${UNDATED_VIDEO}">undated</a>
    </ytd-rich-item-renderer>
  `;
}

function stateOf(id: string): string | null {
  return document.querySelector(`#${id}`)?.getAttribute(STATE_ATTR) ?? null;
}

let stopContentScript: (() => void) | null = null;

async function bootContentScript(
  settings: Partial<Settings>,
  html: string = feed(),
  historicalVideos: typeof DEFAULT_HISTORICAL_VIDEOS | Promise<typeof DEFAULT_HISTORICAL_VIDEOS> =
    DEFAULT_HISTORICAL_VIDEOS,
  resolutionOptions: {
    gate?: Promise<void>;
    status?: "html-rate-limited";
    failuresBeforeSuccess?: number;
  } = {}
): Promise<void> {
  installChromeStub(settings, historicalVideos, resolutionOptions);
  document.body.innerHTML = html;

  vi.resetModules();
  const { start } = await import("../src/content/index");
  stopContentScript = await start();
  await settle();
}

async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const current = (storage["settings"] ?? {}) as Partial<Settings>;
  await (
    globalThis as unknown as { chrome: typeof chrome }
  ).chrome.storage.local.set({ settings: { ...current, ...patch } });
  await settle();
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-time-slipper");
  document.documentElement.removeAttribute("data-time-slipper-unknown");
});

afterEach(() => {
  // Stop the instance before the next test: it observes the shared jsdom
  // document, and a leftover instance would keep filtering the next test's DOM.
  stopContentScript?.();
  stopContentScript = null;

  vi.resetModules();
  delete (globalThis as Record<string, unknown>)["chrome"];
});

describe("content script, end to end", () => {
  it("shows past videos and hides future ones", async () => {
    await bootContentScript({ enabled: true, virtualDate: "2012-08-12" });

    expect(document.documentElement.getAttribute("data-time-slipper")).toBe("on");
    expect(stateOf("old")).toBe("visible");
    expect(stateOf("new")).toBe("future");
  });

  it("hides undated videos under the strict default", async () => {
    await bootContentScript({
      enabled: true,
      virtualDate: "2012-08-12",
      unknownPolicy: "hide"
    });

    expect(stateOf("undated")).toBe("unknown");
    expect(document.documentElement.getAttribute("data-time-slipper-unknown")).toBe(
      "hide"
    );
  });

  it("asks the worker only once per video", async () => {
    await bootContentScript({ enabled: true, virtualDate: "2012-08-12" });

    const asked = sendMessage.mock.calls
      .map((call) => call[0] as ExtensionRequest)
      .filter((request): request is ResolveVideoDatesRequest =>
        request.type === MESSAGE_RESOLVE_VIDEO_DATES
      )
      .flatMap((request) => request.videoIds);

    expect(new Set(asked).size).toBe(asked.length);
    expect(new Set(asked)).toEqual(new Set([OLD_VIDEO, NEW_VIDEO, UNDATED_VIDEO]));
  });

  it("retries pending cards when resolver backoff expires on a quiet page", async () => {
    vi.useFakeTimers();
    settleWithFakeTimers = true;

    try {
      await bootContentScript(
        {
          enabled: true,
          virtualDate: "2012-08-12",
          fillFeed: false,
          discoverEra: false
        },
        feed(),
        [],
        { failuresBeforeSuccess: 3 }
      );

      const resolutionCalls = () => sendMessage.mock.calls.filter(
        (call) => (call[0] as ExtensionRequest).type === MESSAGE_RESOLVE_VIDEO_DATES
      ).length;
      expect(resolutionCalls()).toBe(3);
      expect(stateOf("old")).toBe("pending");

      await vi.advanceTimersByTimeAsync(31_000);

      expect(resolutionCalls()).toBeGreaterThan(3);
      expect(stateOf("old")).toBe("visible");
      expect(stateOf("new")).toBe("future");
    } finally {
      stopContentScript?.();
      stopContentScript = null;
      settleWithFakeTimers = false;
      vi.useRealTimers();
    }
  });

  it("does nothing at all while disabled", async () => {
    await bootContentScript({ enabled: false, virtualDate: "2012-08-12" });

    expect(document.documentElement.hasAttribute("data-time-slipper")).toBe(false);
    expect(stateOf("old")).toBeNull();
    expect(stateOf("new")).toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("re-evaluates in place when the virtual date moves, with no reload", async () => {
    await bootContentScript({ enabled: true, virtualDate: "2012-08-12" });
    expect(stateOf("new")).toBe("future");

    const resolutionCallsBefore = sendMessage.mock.calls.filter(
      (call) => (call[0] as ExtensionRequest).type === MESSAGE_RESOLVE_VIDEO_DATES
    ).length;

    await updateSettings({ virtualDate: "2020-01-01" });

    expect(stateOf("new")).toBe("visible");
    expect(stateOf("old")).toBe("visible");
    // Dates are immutable, so moving the cutoff must not re-resolve anything.
    expect(sendMessage.mock.calls.filter(
      (call) => (call[0] as ExtensionRequest).type === MESSAGE_RESOLVE_VIDEO_DATES
    )).toHaveLength(resolutionCallsBefore);
  });

  it("reveals undated videos when the policy is relaxed", async () => {
    await bootContentScript({
      enabled: true,
      virtualDate: "2012-08-12",
      unknownPolicy: "hide"
    });

    await updateSettings({ unknownPolicy: "show" });

    // The verdict stays "unknown"; the CSS flag on <html> is what changes, so
    // the card reappears without a rescan.
    expect(stateOf("undated")).toBe("unknown");
    expect(document.documentElement.getAttribute("data-time-slipper-unknown")).toBe(
      "show"
    );
  });

  it("removes every trace when switched off", async () => {
    await bootContentScript({ enabled: true, virtualDate: "2012-08-12" });
    expect(stateOf("new")).toBe("future");

    await updateSettings({ enabled: false });

    expect(document.querySelectorAll(`[${STATE_ATTR}]`)).toHaveLength(0);
    expect(document.documentElement.hasAttribute("data-time-slipper")).toBe(false);
    expect(document.querySelector(".time-slipper-badge")).toBeNull();
  });

  it("filters videos that appear later, as infinite scroll adds them", async () => {
    await bootContentScript({ enabled: true, virtualDate: "2012-08-12" });

    const appended = document.createElement("ytd-rich-item-renderer");
    appended.id = "appended";
    appended.innerHTML = `<a href="/watch?v=${APPENDED_VIDEO}">new</a>`;
    document.body.appendChild(appended);

    await settle();

    expect(stateOf("appended")).toBe("future");
  });

  it("re-checks a card element that YouTube recycles for another video", async () => {
    await bootContentScript({ enabled: true, virtualDate: "2012-08-12" });
    expect(stateOf("old")).toBe("visible");

    document
      .querySelector("#old a")!
      .setAttribute("href", `/watch?v=${RECYCLED_VIDEO}`);

    await settle();

    expect(stateOf("old")).toBe("future");
  });

  it("leaves a surface alone when the user opts it out", async () => {
    await bootContentScript({ enabled: true, virtualDate: "2012-08-12" });
    expect(stateOf("new")).toBe("future");

    await updateSettings({
      surfaces: {
        home: false,
        search: true,
        watchRelated: true,
        channel: true,
        subscriptions: true,
        playlists: true,
        shorts: true
      }
    });

    expect(stateOf("new")).toBeNull();
  });

  it("shows the timeline badge with the active date", async () => {
    await bootContentScript({ enabled: true, virtualDate: "2012-08-12" });

    const badge = document.querySelector(".time-slipper-badge");
    expect(badge?.textContent).toContain("2012-08-12");
  });
});

/**
 * The page must not merely lose videos — it has to remain a coherent page.
 * These cover the difference the user actually sees: no orphaned shelves, an
 * explanation instead of a blank screen, and more material requested.
 */
describe("a feed that filtering empties", () => {
  function datedFeed(ids: string[]): string {
    return `<div id="contents">${ids
      .map(
        (id) =>
          `<ytd-rich-item-renderer><a href="/watch?v=${id}">${id}</a></ytd-rich-item-renderer>`
      )
      .join("")}</div>`;
  }

  function feedWithShelf(): string {
    return `
      <div id="contents">
        <ytd-rich-shelf-renderer id="all-future">
          <ytd-rich-item-renderer>
            <a href="/watch?v=${NEW_VIDEO}">new</a>
          </ytd-rich-item-renderer>
        </ytd-rich-shelf-renderer>

        <ytd-rich-shelf-renderer id="has-survivor">
          <ytd-rich-item-renderer>
            <a href="/watch?v=${NEW_VIDEO}">new</a>
          </ytd-rich-item-renderer>
          <ytd-rich-item-renderer>
            <a href="/watch?v=${OLD_VIDEO}">old</a>
          </ytd-rich-item-renderer>
        </ytd-rich-shelf-renderer>

        <ytd-rich-section-renderer id="no-videos">
          <p>Breaking news</p>
        </ytd-rich-section-renderer>

        <ytd-continuation-item-renderer></ytd-continuation-item-renderer>
      </div>
    `;
  }

  function shelfState(id: string): string | null {
    return document.querySelector(`#${id}`)?.getAttribute("data-time-slipper-shelf") ?? null;
  }

  it("removes a shelf whose videos are all in the future", async () => {
    await bootContentScript({ enabled: true, virtualDate: "2012-08-12" }, feedWithShelf());

    expect(shelfState("all-future")).toBe("empty");
  });

  it("keeps a shelf that still has something to show", async () => {
    await bootContentScript({ enabled: true, virtualDate: "2012-08-12" }, feedWithShelf());

    expect(shelfState("has-survivor")).toBeNull();
  });

  it("does not touch a shelf that holds no videos", async () => {
    await bootContentScript({ enabled: true, virtualDate: "2012-08-12" }, feedWithShelf());

    expect(shelfState("no-videos")).toBeNull();
  });

  it("explains the sparse page instead of leaving it blank", async () => {
    await bootContentScript(
      {
        enabled: true,
        virtualDate: "2012-08-12",
        fillFeed: false,
        discoverEra: false
      },
      feedWithShelf()
    );

    const panel = document.querySelector(".time-slipper-empty");
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("Few videos match this date");
    expect(panel?.querySelector("button")?.textContent).toBe("Load more");
  });

  it("never shows the sparse panel when 46 visible videos exceed a target of 20", async () => {
    const ids = Array.from({ length: 46 }, (_, index) =>
      `V${String(index).padStart(10, "0")}`
    );
    for (const id of ids) DATES[id] = "2011-01-01";

    await bootContentScript(
      { enabled: true, virtualDate: "2012-08-12", fillTargetVisible: 20 },
      datedFeed(ids)
    );

    expect(document.querySelectorAll('[data-time-slipper-state="visible"]')).toHaveLength(46);
    expect(document.querySelector(".time-slipper-empty")).toBeNull();
    expect(sendMessage.mock.calls.some(
      (call) => (call[0] as ExtensionRequest).type === MESSAGE_DISCOVER_ERA
    )).toBe(false);
  });

  it("combines 5 native survivors with 15 API results to satisfy a target of 20", async () => {
    const nativeIds = Array.from({ length: 5 }, (_, index) =>
      `N${String(index).padStart(10, "0")}`
    );
    for (const id of nativeIds) DATES[id] = "2011-01-01";

    const apiVideos = Array.from({ length: 15 }, (_, index) => ({
      videoId: `H${String(index).padStart(10, "0")}`,
      title: `historical ${index}`,
      publishedDate: "2011-06-01"
    }));

    await bootContentScript(
      {
        enabled: true,
        virtualDate: "2012-08-12",
        fillFeed: false,
        fillTargetVisible: 20
      },
      datedFeed(nativeIds),
      apiVideos
    );

    expect(document.querySelectorAll(".time-slipper-discover__card")).toHaveLength(15);
    expect(document.querySelector(".time-slipper-empty")).toBeNull();
    const historicalShelf = document.querySelector(
      "[data-time-slipper-historical-feed]"
    );
    expect(historicalShelf?.textContent)
      .toContain("Time Slipper historical results");

    // YouTube replaces feed renderers during SPA updates. The historical UI
    // must reconnect on the next scan instead of being counted while detached.
    document.body.innerHTML = datedFeed(nativeIds);
    await settle();
    expect(document.querySelector("[data-time-slipper-historical-feed]")).toBe(
      historicalShelf
    );
    expect(document.querySelectorAll(".time-slipper-discover__card")).toHaveLength(15);
  });

  it("keeps one stable status panel while the historical source finishes", async () => {
    let finishSearch!: (videos: typeof DEFAULT_HISTORICAL_VIDEOS) => void;
    const pendingSearch = new Promise<typeof DEFAULT_HISTORICAL_VIDEOS>((resolve) => {
      finishSearch = resolve;
    });

    await bootContentScript(
      {
        enabled: true,
        virtualDate: "2012-08-12",
        fillFeed: false,
        fillTargetVisible: 20
      },
      feedWithShelf(),
      pendingSearch
    );

    const panel = document.querySelector(".time-slipper-empty");
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute("data-state")).toBe("loading");

    finishSearch([]);
    await settle();

    expect(document.querySelector(".time-slipper-empty")).toBe(panel);
    expect(panel?.getAttribute("data-state")).toBe("exhausted");
  });

  it("starts the API historical feed while native date resolution is still pending", async () => {
    const nativeResolution = new Promise<void>(() => {});

    await bootContentScript(
      {
        enabled: true,
        virtualDate: "2012-08-12",
        fillFeed: false,
        apiKey: "AIzaConfiguredKey"
      },
      feedWithShelf(),
      DEFAULT_HISTORICAL_VIDEOS,
      { gate: nativeResolution }
    );

    expect(sendMessage.mock.calls.some(
      (call) => (call[0] as ExtensionRequest).type === MESSAGE_DISCOVER_ERA
    )).toBe(true);
    expect(document.querySelectorAll(".time-slipper-discover__card")).toHaveLength(2);

    const discovery = sendMessage.mock.calls
      .map((call) => call[0] as ExtensionRequest)
      .find((request) => request.type === MESSAGE_DISCOVER_ERA);
    expect(discovery?.type === MESSAGE_DISCOVER_ERA ? discovery.exclude : []).toEqual(
      expect.arrayContaining([OLD_VIDEO, NEW_VIDEO])
    );
  });

  it("never renders a historical duplicate of a pending native card", async () => {
    const nativeResolution = new Promise<void>(() => {});
    const overlapping = [{
      videoId: NEW_VIDEO,
      title: "duplicate pending native video",
      publishedDate: "2011-06-01"
    }];

    await bootContentScript(
      {
        enabled: true,
        virtualDate: "2012-08-12",
        fillFeed: false,
        apiKey: "AIzaConfiguredKey"
      },
      feedWithShelf(),
      overlapping,
      { gate: nativeResolution }
    );

    expect(document.querySelectorAll(".time-slipper-discover__card")).toHaveLength(0);
  });

  it("hides repeated native cards with the same video id", async () => {
    await bootContentScript(
      {
        enabled: true,
        virtualDate: "2012-08-12",
        fillFeed: false,
        discoverEra: false
      },
      `<div id="contents">
        <ytd-rich-item-renderer id="copy-one"><a href="/watch?v=${OLD_VIDEO}">one</a></ytd-rich-item-renderer>
        <ytd-rich-item-renderer id="copy-two"><a href="/watch?v=${OLD_VIDEO}">two</a></ytd-rich-item-renderer>
      </div>`
    );

    expect(stateOf("copy-one")).toBe("visible");
    expect(stateOf("copy-two")).toBe("duplicate");
  });

  it("prefers the current SPA page over an earlier hidden copy", async () => {
    await bootContentScript(
      {
        enabled: true,
        virtualDate: "2012-08-12",
        fillFeed: false,
        discoverEra: false
      },
      `<div id="old-page" hidden>
        <ytd-rich-item-renderer id="old-copy"><a href="/watch?v=${OLD_VIDEO}">old page</a></ytd-rich-item-renderer>
      </div>
      <div id="current-page">
        <ytd-rich-item-renderer id="current-copy"><a href="/watch?v=${OLD_VIDEO}">current page</a></ytd-rich-item-renderer>
      </div>`
    );

    expect(stateOf("old-copy")).toBeNull();
    expect(stateOf("current-copy")).toBe("visible");

    (document.querySelector("#old-page") as HTMLElement).hidden = false;
    (document.querySelector("#current-page") as HTMLElement).hidden = true;
    await settle();
    expect(stateOf("old-copy")).toBe("visible");
    expect(stateOf("current-copy")).toBeNull();
  });

  it("shows a distinct message when the HTML resolver is rate-limited", async () => {
    await bootContentScript(
      {
        enabled: true,
        virtualDate: "2012-08-12",
        fillFeed: false,
        language: "ja"
      },
      feedWithShelf(),
      [],
      { status: "html-rate-limited" }
    );

    expect(document.querySelector(".time-slipper-empty")?.textContent)
      .toContain("YouTube が自動取得を一時的に制限しています。");
    expect(document.querySelector(".time-slipper-empty")?.textContent)
      .not.toContain("古い動画を探しています…");
  });

  it("asks YouTube for more videos", async () => {
    const scrolled = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      value: scrolled,
      configurable: true,
      writable: true
    });

    await bootContentScript({ enabled: true, virtualDate: "2012-08-12" }, feedWithShelf());

    // The continuation sentinel is what YouTube's own infinite scroll waits on.
    expect(scrolled).toHaveBeenCalled();
  });

  it("leaves the page alone when refilling is switched off", async () => {
    const scrolled = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      value: scrolled,
      configurable: true,
      writable: true
    });

    await bootContentScript(
      { enabled: true, virtualDate: "2012-08-12", fillFeed: false },
      feedWithShelf()
    );

    expect(scrolled).not.toHaveBeenCalled();
    // Shelves are still collapsed: that is tidying, not refilling.
    expect(shelfState("all-future")).toBe("empty");
    // And the thin page is still explained rather than left blank.
    expect(document.querySelector(".time-slipper-empty")).not.toBeNull();
  });

  it("restores every shelf when the extension is switched off", async () => {
    await bootContentScript({ enabled: true, virtualDate: "2012-08-12" }, feedWithShelf());
    expect(shelfState("all-future")).toBe("empty");

    await updateSettings({ enabled: false });

    expect(document.querySelectorAll("[data-time-slipper-shelf]")).toHaveLength(0);
    expect(document.querySelector(".time-slipper-empty")).toBeNull();
  });
});

describe("features that did not exist yet", () => {
  function pageWithShorts(): string {
    return `
      <div id="contents">
        <ytd-guide-entry-renderer id="shorts-entry">
          <a href="/shorts">Shorts</a>
        </ytd-guide-entry-renderer>
        <ytd-guide-entry-renderer id="playables-entry">
          <a href="/playables">Playables</a>
        </ytd-guide-entry-renderer>
        <ytd-guide-entry-renderer id="subs-entry">
          <a href="/feed/subscriptions">Subscriptions</a>
        </ytd-guide-entry-renderer>
        <ytd-reel-shelf-renderer id="shorts-shelf"></ytd-reel-shelf-renderer>
        <ytd-rich-item-renderer id="old">
          <a href="/watch?v=${OLD_VIDEO}">old</a>
        </ytd-rich-item-renderer>
      </div>
    `;
  }

  function era(id: string): string | null {
    return document.querySelector(`#${id}`)?.getAttribute("data-time-slipper-era") ?? null;
  }

  it("removes Shorts and Playables from a 2012 timeline", async () => {
    await bootContentScript(
      { enabled: true, virtualDate: "2012-08-12" },
      pageWithShorts()
    );

    expect(era("shorts-entry")).toBe("shorts");
    expect(era("shorts-shelf")).toBe("shorts");
    expect(era("playables-entry")).toBe("playables");
  });

  it("leaves features that already existed", async () => {
    await bootContentScript(
      { enabled: true, virtualDate: "2012-08-12" },
      pageWithShorts()
    );

    expect(era("subs-entry")).toBeNull();
    expect(stateOf("old")).toBe("visible");
  });

  it("brings a feature back when the date moves past its launch", async () => {
    await bootContentScript(
      { enabled: true, virtualDate: "2012-08-12" },
      pageWithShorts()
    );
    expect(era("shorts-entry")).toBe("shorts");

    await updateSettings({ virtualDate: "2024-01-01" });

    expect(era("shorts-entry")).toBeNull();
  });

  it("restores everything when the extension is switched off", async () => {
    await bootContentScript(
      { enabled: true, virtualDate: "2012-08-12" },
      pageWithShorts()
    );

    await updateSettings({ enabled: false });

    expect(document.querySelectorAll("[data-time-slipper-era]")).toHaveLength(0);
  });
});

describe("a period rather than a cutoff", () => {
  it("hides videos from before the window as well as after it", async () => {
    await bootContentScript({
      enabled: true,
      virtualDate: "2012-08-12",
      rangeStart: "2010-01-01"
    });

    // 2008 — before the window; 2018 — after it.
    expect(stateOf("old")).toBe("before");
    expect(stateOf("new")).toBe("future");
  });

  it("re-includes them when the lower bound is cleared", async () => {
    await bootContentScript({
      enabled: true,
      virtualDate: "2012-08-12",
      rangeStart: "2010-01-01"
    });
    expect(stateOf("old")).toBe("before");

    await updateSettings({ rangeStart: null });

    expect(stateOf("old")).toBe("visible");
  });
});

/**
 * The complaint this answers: filtering a personalised feed returns only the
 * videos the user already watches, so the page is both empty and repetitive.
 * Discovery goes outside that feed.
 */
describe("finding videos outside what YouTube recommended", () => {
  function sparseFeed(): string {
    return `
      <div id="contents">
        <ytd-rich-item-renderer id="old">
          <a href="/watch?v=${OLD_VIDEO}">old</a>
        </ytd-rich-item-renderer>
        <ytd-rich-item-renderer id="new">
          <a href="/watch?v=${NEW_VIDEO}">new</a>
        </ytd-rich-item-renderer>
      </div>
    `;
  }

  function discoveryRequests() {
    return sendMessage.mock.calls
      .map((call) => call[0] as { type: string; seeds?: string[]; exclude?: string[] })
      .filter((message) => message.type === MESSAGE_DISCOVER_ERA);
  }

  it("shows era videos that were never in the feed", async () => {
    await bootContentScript(
      { enabled: true, virtualDate: "2012-08-12", fillFeed: false, discoverEra: true },
      sparseFeed()
    );

    const cards = document.querySelectorAll(".time-slipper-discover__card");
    expect(cards).toHaveLength(2);
    expect(cards[0]?.textContent).toContain("A video from the era");
    expect(cards[0]?.getAttribute("href")).toBe("/watch?v=DDDDDDDDDDD");
  });

  it("keeps a loading panel visible while historical results refresh", async () => {
    await bootContentScript(
      { enabled: true, virtualDate: "2012-08-12", fillFeed: false, discoverEra: true },
      sparseFeed()
    );

    let finishRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      finishRefresh = resolve;
    });
    const previousImplementation = sendMessage.getMockImplementation()!;
    sendMessage.mockImplementation(async (request: ExtensionRequest) => {
      if (request.type !== MESSAGE_DISCOVER_ERA) {
        return previousImplementation(request);
      }

      await refreshGate;
      return {
        type: MESSAGE_ERA_DISCOVERED,
        source: "api",
        exhausted: true,
        videos: DEFAULT_HISTORICAL_VIDEOS
      };
    });

    const panel = document.querySelector<HTMLElement>(".time-slipper-empty")!;
    document.querySelector<HTMLButtonElement>(
      ".time-slipper-discover__refresh"
    )!.click();

    expect(document.contains(panel)).toBe(true);
    expect(panel.dataset.state).toBe("loading");

    finishRefresh();
    await settle();
    expect(document.querySelectorAll(".time-slipper-discover__card")).toHaveLength(2);
  });

  it("walks out from videos that are inside the window", async () => {
    await bootContentScript(
      { enabled: true, virtualDate: "2012-08-12", fillFeed: false, discoverEra: true },
      sparseFeed()
    );

    const [request] = discoveryRequests();
    expect(request?.seeds).toEqual([OLD_VIDEO]);
    // Videos already on the page would not be a discovery.
    expect(request?.exclude).toContain(NEW_VIDEO);
  });

  it("does not run when switched off", async () => {
    await bootContentScript(
      { enabled: true, virtualDate: "2012-08-12", fillFeed: false, discoverEra: false },
      sparseFeed()
    );

    expect(discoveryRequests()).toHaveLength(0);
    expect(document.querySelector(".time-slipper-discover")).toBeNull();
  });

  it("asks only once per page", async () => {
    await bootContentScript(
      { enabled: true, virtualDate: "2012-08-12", fillFeed: false, discoverEra: true },
      sparseFeed()
    );

    // The mutation observer fires repeatedly; the walk is expensive and must
    // not restart on every scan.
    document.querySelector("#contents")!.appendChild(document.createElement("div"));
    await settle();

    expect(discoveryRequests()).toHaveLength(1);
  });

  it("discards a historical response after discovery is switched off", async () => {
    let finishSearch!: (videos: typeof DEFAULT_HISTORICAL_VIDEOS) => void;
    const pendingSearch = new Promise<typeof DEFAULT_HISTORICAL_VIDEOS>((resolve) => {
      finishSearch = resolve;
    });

    await bootContentScript(
      { enabled: true, virtualDate: "2012-08-12", fillFeed: false, discoverEra: true },
      sparseFeed(),
      pendingSearch
    );

    await updateSettings({ discoverEra: false });
    finishSearch(DEFAULT_HISTORICAL_VIDEOS);
    await settle();

    expect(document.querySelector(".time-slipper-discover")).toBeNull();
  });

  it("removes the shelf when the extension is switched off", async () => {
    await bootContentScript(
      { enabled: true, virtualDate: "2012-08-12", fillFeed: false, discoverEra: true },
      sparseFeed()
    );
    expect(document.querySelector(".time-slipper-discover")).not.toBeNull();

    await updateSettings({ enabled: false });

    expect(document.querySelector(".time-slipper-discover")).toBeNull();
  });
});

describe("localisation", () => {
  it("renders the on-page UI in the chosen language", async () => {
    await bootContentScript({
      enabled: true,
      virtualDate: "2012-08-12",
      language: "ja"
    });

    const badge = document.querySelector(".time-slipper-badge");
    expect(badge?.getAttribute("title")).toContain("2012年8月12日");
  });

  it("falls back to English for a language it does not have", async () => {
    await bootContentScript({
      enabled: true,
      virtualDate: "2012-08-12",
      language: "auto"
    });

    const badge = document.querySelector(".time-slipper-badge");
    expect(badge?.getAttribute("title")).toContain("2012");
  });
});
