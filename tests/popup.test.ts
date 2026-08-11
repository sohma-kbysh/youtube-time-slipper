// @vitest-environment jsdom

/**
 * The popup, driven against its real markup.
 *
 * Worth testing rather than clicking through: the popup is the only writer of
 * settings, and a control that silently fails to persist looks identical to
 * one that works until you reload.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { todayAsCalendarDate } from "../src/core/date";
import { MESSAGE_API_KEY_VERIFIED } from "../src/core/messages";
import type { Settings } from "../src/core/types";

let stored: Record<string, unknown>;
let setSpy: ReturnType<typeof vi.fn>;
let sendMessage: ReturnType<typeof vi.fn>;
let permissionRequest: ReturnType<typeof vi.fn>;

function loadMarkup(): void {
  // Resolved from the project root: under the jsdom environment
  // `import.meta.url` is an http: URL, not a file: one.
  const html = readFileSync(
    resolve(process.cwd(), "src/popup/popup.html"),
    "utf8"
  );

  const body = html.split("<body>")[1]?.split("</body>")[0] ?? "";
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, "");
}

function installChromeStub(settings: Partial<Settings>): void {
  stored = { settings, ...(stored?.["apiUsage"] ? { apiUsage: stored["apiUsage"] } : {}) };

  setSpy = vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(stored, items);
  });

  // Verification goes through the worker, and the API host permission is
  // optional, so both are stubbed here.
  sendMessage = vi.fn(async () => ({ type: MESSAGE_API_KEY_VERIFIED, ok: true }));
  permissionRequest = vi.fn(async () => true);

  (globalThis as Record<string, unknown>)["chrome"] = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: stored[key] }),
        set: setSpy,
        remove: async () => {}
      },
      onChanged: { addListener: () => {}, removeListener: () => {} }
    },
    runtime: { sendMessage, id: "test-extension-id" },
    permissions: { request: permissionRequest, contains: async () => true }
  };
}

function savedSettings(): Settings {
  return stored["settings"] as Settings;
}

async function openPopup(settings: Partial<Settings>): Promise<void> {
  loadMarkup();
  installChromeStub(settings);

  vi.resetModules();
  await import("../src/popup/popup");

  // Let the initial load-and-render settle.
  await new Promise((resolve) => setTimeout(resolve, 10));
}

function input(selector: string): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(selector)!;
}

function change(element: HTMLElement): void {
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.resetModules();
  delete (globalThis as Record<string, unknown>)["chrome"];
});

describe("popup", () => {
  it("renders the stored settings", async () => {
    await openPopup({
      enabled: true,
      virtualDate: "2012-08-12",
      unknownPolicy: "show",
      showTimelineBadge: false
    });

    expect(input("#enabled").checked).toBe(true);
    expect(input("#virtual-date").value).toBe("2012-08-12");
    expect(input("input[name=unknown][value=show]").checked).toBe(true);
    expect(input("#badge").checked).toBe(false);
    expect(document.querySelector("#virtual-date-summary")?.textContent).toContain(
      "12 August 2012"
    );
  });

  it("builds a checkbox for every configurable surface", async () => {
    await openPopup({ enabled: true, virtualDate: "2012-08-12" });

    const surfaces = [...document.querySelectorAll("#surfaces input")].map(
      (element) => (element as HTMLInputElement).dataset["surface"]
    );

    expect(surfaces).toEqual([
      "home",
      "search",
      "watchRelated",
      "channel",
      "subscriptions",
      "playlists",
      "shorts"
    ]);
  });

  it("persists the timeline switch", async () => {
    await openPopup({ enabled: false, virtualDate: "2012-08-12" });

    input("#enabled").checked = true;
    change(input("#enabled"));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(savedSettings().enabled).toBe(true);
  });

  it("persists a new virtual date", async () => {
    await openPopup({ enabled: true, virtualDate: "2012-08-12" });

    input("#virtual-date").value = "2009-01-01";
    change(input("#virtual-date"));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(savedSettings().virtualDate).toBe("2009-01-01");
  });

  it("refuses to persist an empty or invalid date", async () => {
    await openPopup({ enabled: true, virtualDate: "2012-08-12" });

    input("#virtual-date").value = "";
    change(input("#virtual-date"));
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Storing a corrupt date would leave the user with no filtering at all.
    expect(setSpy).not.toHaveBeenCalled();
    expect(document.querySelector("#virtual-date-error")?.hasAttribute("hidden")).toBe(
      false
    );
  });

  it("persists a surface being switched off", async () => {
    await openPopup({ enabled: true, virtualDate: "2012-08-12" });

    const shorts = input('#surfaces input[data-surface="shorts"]');
    shorts.checked = false;
    change(shorts);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(savedSettings().surfaces.shorts).toBe(false);
    expect(savedSettings().surfaces.home).toBe(true);
  });

  it("offers every language, each named in its own script", async () => {
    await openPopup({ enabled: true, virtualDate: "2012-08-12" });

    const options = [...document.querySelectorAll("#language option")].map(
      (option) => (option as HTMLOptionElement).value
    );

    expect(options).toEqual(["auto", "en", "ja", "zh", "ko", "es", "de"]);
    expect(document.querySelector("#language option[value=ja]")?.textContent).toBe(
      "日本語"
    );
  });

  it("re-renders the whole popup in the chosen language", async () => {
    await openPopup({ enabled: true, virtualDate: "2012-08-12" });

    const select = document.querySelector<HTMLSelectElement>("#language")!;
    select.value = "ja";
    change(select);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(savedSettings().language).toBe("ja");
    expect(document.querySelector("#today")?.textContent).toBe("今日");
    expect(document.querySelector("#status")?.textContent).toContain("2012年8月12日");
    expect(document.documentElement.lang).toBe("ja");
  });

  it("persists the feed-filling switch", async () => {
    await openPopup({ enabled: true, virtualDate: "2012-08-12", fillFeed: true });

    input("#fill-feed").checked = false;
    change(input("#fill-feed"));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(savedSettings().fillFeed).toBe(false);
  });

  it("persists a period and summarises it", async () => {
    await openPopup({ enabled: true, virtualDate: "2012-08-12" });

    input("#range-start").value = "2010-01-01";
    change(input("#range-start"));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(savedSettings().rangeStart).toBe("2010-01-01");
    expect(document.querySelector("#virtual-date-summary")?.textContent).toContain(
      "1 January 2010"
    );
  });

  it("clears the period", async () => {
    await openPopup({
      enabled: true,
      virtualDate: "2012-08-12",
      rangeStart: "2010-01-01"
    });

    document.querySelector<HTMLButtonElement>("#range-clear")!.click();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(savedSettings().rangeStart).toBeNull();
    expect(input("#range-start").value).toBe("");
  });

  it("lists only the features that postdate the virtual present", async () => {
    await openPopup({ enabled: true, virtualDate: "2012-08-12" });

    const listed = [...document.querySelectorAll("#features input")].map(
      (element) => (element as HTMLInputElement).dataset["feature"]
    );

    expect(listed).toContain("shorts");
    expect(listed).toContain("playables");
    expect(listed).not.toContain("liveStreaming");
  });

  it("lets a single feature be kept", async () => {
    await openPopup({ enabled: true, virtualDate: "2012-08-12" });

    const shorts = input('#features input[data-feature="shorts"]');
    expect(shorts.checked).toBe(true);

    shorts.checked = false;
    change(shorts);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(savedSettings().allowedFeatures).toEqual(["shorts"]);
  });

  it("says so when nothing on the list is anachronistic", async () => {
    await openPopup({ enabled: true, virtualDate: "2026-08-12" });

    expect(document.querySelectorAll("#features input")).toHaveLength(0);
    expect(document.querySelector("#features")?.textContent).toContain("already existed");
  });

  it("persists the refill limits", async () => {
    await openPopup({ enabled: true, virtualDate: "2012-08-12" });

    input("#fill-target").value = "60";
    change(input("#fill-target"));
    await new Promise((resolve) => setTimeout(resolve, 10));

    input("#fill-rounds").value = "120";
    change(input("#fill-rounds"));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(savedSettings().fillTargetVisible).toBe(60);
    expect(savedSettings().fillMaxRounds).toBe(120);
  });

  it("clamps an out-of-range refill limit rather than storing it", async () => {
    await openPopup({ enabled: true, virtualDate: "2012-08-12" });

    input("#fill-rounds").value = "99999";
    change(input("#fill-rounds"));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(savedSettings().fillMaxRounds).toBe(300);
  });

  it("stores an API key only after it has been verified", async () => {
    await openPopup({ enabled: true, virtualDate: "2012-08-12" });

    input("#api-key").value = "AIzaWorkingKey";
    document.querySelector<HTMLButtonElement>("#api-verify")!.click();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(permissionRequest).toHaveBeenCalledWith({
      origins: ["https://www.googleapis.com/*"]
    });
    expect(savedSettings().apiKey).toBe("AIzaWorkingKey");
    expect(document.querySelector("#api-status")?.textContent).toContain("Key works");
  });

  it("does not store a key the API rejected", async () => {
    await openPopup({ enabled: true, virtualDate: "2012-08-12" });

    sendMessage.mockResolvedValueOnce({
      type: MESSAGE_API_KEY_VERIFIED,
      ok: false,
      errorKind: "invalid-key",
      detail: "API key not valid"
    });

    input("#api-key").value = "typo";
    document.querySelector<HTMLButtonElement>("#api-verify")!.click();
    await new Promise((resolve) => setTimeout(resolve, 20));

    // A stored-but-broken key would fail silently on every search.
    expect(setSpy).not.toHaveBeenCalled();
    expect(document.querySelector("#api-status")?.textContent).toContain("rejected");
  });

  it("explains a disabled API differently from a bad key", async () => {
    await openPopup({ enabled: true, virtualDate: "2012-08-12" });

    sendMessage.mockResolvedValueOnce({
      type: MESSAGE_API_KEY_VERIFIED,
      ok: false,
      errorKind: "not-enabled"
    });

    input("#api-key").value = "AIzaKey";
    document.querySelector<HTMLButtonElement>("#api-verify")!.click();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(document.querySelector("#api-status")?.textContent).toContain("not enabled");
  });

  it("does not store a key when the host permission is declined", async () => {
    await openPopup({ enabled: true, virtualDate: "2012-08-12" });

    permissionRequest.mockResolvedValueOnce(false);

    input("#api-key").value = "AIzaKey";
    document.querySelector<HTMLButtonElement>("#api-verify")!.click();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(setSpy).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(document.querySelector("#api-status")?.textContent).toContain("declined");
  });

  it("removes a stored key without asking the API", async () => {
    await openPopup({
      enabled: true,
      virtualDate: "2012-08-12",
      apiKey: "AIzaOldKey"
    });

    expect(input("#api-key").value).toBe("AIzaOldKey");

    document.querySelector<HTMLButtonElement>("#api-remove")!.click();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(savedSettings().apiKey).toBe("");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("shows today's quota use", async () => {
    stored["apiUsage"] = { day: todayAsCalendarDate(), units: 300 };
    await openPopup({ enabled: true, virtualDate: "2012-08-12" });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(document.querySelector("#api-usage")?.textContent).toContain("300");
  });

  it("reports a storage failure with its real message", async () => {
    await openPopup({ enabled: true, virtualDate: "2012-08-12" });

    setSpy.mockRejectedValueOnce(new Error("QuotaExceededError"));

    input("#badge").checked = false;
    change(input("#badge"));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(document.querySelector("#status")?.textContent).toContain(
      "QuotaExceededError"
    );
  });
});
