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
  MESSAGE_VIDEO_DATES_RESOLVED,
  type ResolveVideoDatesRequest
} from "../src/core/messages";
import type { PublicationResolution, Settings, VideoId } from "../src/core/types";
import { STATE_ATTR } from "../src/content/visibility";

const OLD_VIDEO = "AAAAAAAAAAA";
const NEW_VIDEO = "BBBBBBBBBBB";
const UNDATED_VIDEO = "CCCCCCCCCCC";

const DATES: Record<VideoId, string | null> = {
  [OLD_VIDEO]: "2008-04-03",
  [NEW_VIDEO]: "2018-03-01",
  [UNDATED_VIDEO]: null
};

interface StorageListener {
  (changes: Record<string, { newValue?: unknown }>, areaName: string): void;
}

let storage: Record<string, unknown>;
let storageListeners: StorageListener[];
let sendMessage: ReturnType<typeof vi.fn>;

function installChromeStub(initial: Partial<Settings>): void {
  storage = { settings: initial };
  storageListeners = [];

  sendMessage = vi.fn(async (message: ResolveVideoDatesRequest) => {
    const results: Record<VideoId, PublicationResolution> = {};

    for (const videoId of message.videoIds) {
      results[videoId] = {
        videoId,
        publishedDate: DATES[videoId] ?? null,
        source: "youtube-html",
        confidence: DATES[videoId] ? "exact-day" : "unknown",
        resolvedAt: Date.now()
      };
    }

    return { type: MESSAGE_VIDEO_DATES_RESOLVED, results };
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
async function settle(): Promise<void> {
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 20));
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

async function bootContentScript(settings: Partial<Settings>): Promise<void> {
  installChromeStub(settings);
  document.body.innerHTML = feed();

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

    const asked = sendMessage.mock.calls.flatMap(
      (call) => (call[0] as ResolveVideoDatesRequest).videoIds
    );

    expect(new Set(asked).size).toBe(asked.length);
    expect(new Set(asked)).toEqual(new Set([OLD_VIDEO, NEW_VIDEO, UNDATED_VIDEO]));
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

    const callsBefore = sendMessage.mock.calls.length;

    await updateSettings({ virtualDate: "2020-01-01" });

    expect(stateOf("new")).toBe("visible");
    expect(stateOf("old")).toBe("visible");
    // Dates are immutable, so moving the cutoff must not re-resolve anything.
    expect(sendMessage.mock.calls.length).toBe(callsBefore);
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
    appended.innerHTML = `<a href="/watch?v=${NEW_VIDEO}">new</a>`;
    document.body.appendChild(appended);

    await settle();

    expect(stateOf("appended")).toBe("future");
  });

  it("re-checks a card element that YouTube recycles for another video", async () => {
    await bootContentScript({ enabled: true, virtualDate: "2012-08-12" });
    expect(stateOf("old")).toBe("visible");

    document
      .querySelector("#old a")!
      .setAttribute("href", `/watch?v=${NEW_VIDEO}`);

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
