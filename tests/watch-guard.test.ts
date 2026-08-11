// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://www.youtube.com/watch?v=BBBBBBBBBBB" }

/**
 * Direct navigation to a watch page.
 *
 * Filtering feeds only controls what YouTube offers; this covers the case where
 * the user arrives at a video by URL, which is the only path that actually
 * plays something.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MESSAGE_VIDEO_DATES_RESOLVED,
  type ResolveVideoDatesRequest
} from "../src/core/messages";
import type { PublicationResolution, Settings, VideoId } from "../src/core/types";
import { ROOT_WATCH_ATTR } from "../src/content/visibility";

const PAST_VIDEO = "AAAAAAAAAAA";
const FUTURE_VIDEO = "BBBBBBBBBBB";
const UNDATED_VIDEO = "CCCCCCCCCCC";

const DATES: Record<VideoId, string | null> = {
  [PAST_VIDEO]: "2008-04-03",
  [FUTURE_VIDEO]: "2018-03-01",
  [UNDATED_VIDEO]: null
};

let sendMessage: ReturnType<typeof vi.fn>;
let stopContentScript: (() => void) | null = null;

function installChromeStub(settings: Partial<Settings>): void {
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
        get: async (key: string) => ({ [key]: settings }),
        set: async () => {}
      },
      onChanged: { addListener: () => {}, removeListener: () => {} }
    },
    runtime: { sendMessage, onMessage: { addListener: () => {} } }
  };
}

async function settle(): Promise<void> {
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function boot(settings: Partial<Settings>): Promise<void> {
  installChromeStub(settings);
  vi.resetModules();
  const { start } = await import("../src/content/index");
  stopContentScript = await start();
  await settle();
}

function watchState(): string | null {
  return document.documentElement.getAttribute(ROOT_WATCH_ATTR);
}

function overlay(): Element | null {
  return document.querySelector(".time-slipper-block");
}

beforeEach(() => {
  window.history.replaceState({}, "", `/watch?v=${FUTURE_VIDEO}`);
  document.head.innerHTML = "";
  document.body.innerHTML = '<div id="movie_player"><video></video></div>';
  document.documentElement.removeAttribute(ROOT_WATCH_ATTR);
});

afterEach(() => {
  stopContentScript?.();
  stopContentScript = null;
  vi.resetModules();
  delete (globalThis as Record<string, unknown>)["chrome"];
});

describe("watch guard", () => {
  it("blocks a video published after the virtual present", async () => {
    await boot({ enabled: true, virtualDate: "2012-08-12" });

    expect(watchState()).toBe("blocked");
    expect(overlay()).not.toBeNull();
    expect(overlay()?.textContent).toContain("does not exist yet");
    expect(overlay()?.textContent).toContain("1 March 2018");
    expect(overlay()?.textContent).toContain("12 August 2012");
  });

  it("releases a video published before the virtual present", async () => {
    window.history.replaceState({}, "", `/watch?v=${PAST_VIDEO}`);
    await boot({ enabled: true, virtualDate: "2012-08-12" });

    expect(watchState()).toBeNull();
    expect(overlay()).toBeNull();
  });

  it("re-checks on SPA navigation between videos", async () => {
    await boot({ enabled: true, virtualDate: "2012-08-12" });
    expect(watchState()).toBe("blocked");

    window.history.pushState({}, "", `/watch?v=${PAST_VIDEO}`);
    document.dispatchEvent(new Event("yt-navigate-finish"));
    await settle();

    expect(watchState()).toBeNull();
    expect(overlay()).toBeNull();

    window.history.pushState({}, "", `/watch?v=${FUTURE_VIDEO}`);
    document.dispatchEvent(new Event("yt-navigate-finish"));
    await settle();

    expect(watchState()).toBe("blocked");
  });

  it("blocks an undated video under the strict policy", async () => {
    window.history.replaceState({}, "", `/watch?v=${UNDATED_VIDEO}`);
    await boot({ enabled: true, virtualDate: "2012-08-12", unknownPolicy: "hide" });

    expect(watchState()).toBe("blocked");
    expect(overlay()?.textContent).toContain("unknown");
  });

  it("allows an undated video when the policy is relaxed", async () => {
    window.history.replaceState({}, "", `/watch?v=${UNDATED_VIDEO}`);
    await boot({ enabled: true, virtualDate: "2012-08-12", unknownPolicy: "show" });

    expect(watchState()).toBeNull();
  });

  it("uses the page's own metadata instead of a network round trip", async () => {
    document.head.innerHTML =
      '<meta itemprop="datePublished" content="2018-03-01">';

    await boot({ enabled: true, virtualDate: "2012-08-12" });

    expect(watchState()).toBe("blocked");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("re-asserts the block if YouTube's SPA removes the overlay", async () => {
    await boot({ enabled: true, virtualDate: "2012-08-12" });
    expect(overlay()).not.toBeNull();

    // A partial re-render takes the overlay with it.
    overlay()!.remove();
    document.body.appendChild(document.createElement("div"));
    await settle();

    expect(overlay()).not.toBeNull();
    expect(watchState()).toBe("blocked");
  });

  it("stays out of the way when disabled", async () => {
    await boot({ enabled: false, virtualDate: "2012-08-12" });

    expect(watchState()).toBeNull();
    expect(overlay()).toBeNull();
  });
});
