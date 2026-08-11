/**
 * The popup.
 *
 * Every control writes straight to storage; there is no Save button and no tab
 * reload. Open YouTube tabs pick the change up through `chrome.storage.onChanged`
 * and re-evaluate in place, so moving the date is immediate.
 *
 * Errors are reported with their actual message. The extension that inspired
 * this one collapsed every failure into a single opaque "DB WRITE ERR", which
 * left its one public bug report undiagnosable — a storage failure and a
 * permissions failure looked identical.
 */

import {
  formatCalendarDateHuman,
  isValidCalendarDate,
  todayAsCalendarDate
} from "../core/date.js";
import type { ConfigurableSurface, Settings } from "../core/types.js";
import {
  CONFIGURABLE_SURFACES,
  loadSettings,
  patchSettings
} from "../storage/settings.js";

const SURFACE_LABELS: Record<ConfigurableSurface, string> = {
  home: "Home",
  search: "Search",
  watchRelated: "Related",
  channel: "Channels",
  subscriptions: "Subscriptions",
  playlists: "Playlists",
  shorts: "Shorts"
};

const enabledInput = required<HTMLInputElement>("#enabled");
const dateInput = required<HTMLInputElement>("#virtual-date");
const todayButton = required<HTMLButtonElement>("#today");
const dateSummary = required<HTMLElement>("#virtual-date-summary");
const dateError = required<HTMLElement>("#virtual-date-error");
const badgeInput = required<HTMLInputElement>("#badge");
const surfacesContainer = required<HTMLElement>("#surfaces");
const statusLine = required<HTMLElement>("#status");

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`popup markup is missing ${selector}`);
  return element;
}

function surfaceInputs(): NodeListOf<HTMLInputElement> {
  return surfacesContainer.querySelectorAll<HTMLInputElement>("input[type=checkbox]");
}

function buildSurfaceControls(): void {
  for (const surface of CONFIGURABLE_SURFACES) {
    const label = document.createElement("label");
    label.className = "check";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset["surface"] = surface;
    input.addEventListener("change", () => {
      void save({ surfaces: readSurfaces() });
    });

    const text = document.createElement("span");
    text.textContent = SURFACE_LABELS[surface];

    label.append(input, text);
    surfacesContainer.appendChild(label);
  }
}

function readSurfaces(): Record<ConfigurableSurface, boolean> {
  const surfaces = {} as Record<ConfigurableSurface, boolean>;
  for (const input of surfaceInputs()) {
    const surface = input.dataset["surface"] as ConfigurableSurface | undefined;
    if (surface) surfaces[surface] = input.checked;
  }
  return surfaces;
}

function render(settings: Settings): void {
  enabledInput.checked = settings.enabled;
  dateInput.value = settings.virtualDate;
  badgeInput.checked = settings.showTimelineBadge;

  for (const input of document.querySelectorAll<HTMLInputElement>(
    "input[name=unknown]"
  )) {
    input.checked = input.value === settings.unknownPolicy;
  }

  for (const input of surfaceInputs()) {
    const surface = input.dataset["surface"] as ConfigurableSurface | undefined;
    if (surface) input.checked = settings.surfaces[surface];
  }

  dateSummary.textContent = isValidCalendarDate(settings.virtualDate)
    ? `Viewing YouTube as of ${formatCalendarDateHuman(settings.virtualDate)}`
    : "";

  statusLine.textContent = settings.enabled
    ? `Videos published after ${settings.virtualDate} are hidden.`
    : "Timeline off — YouTube is unfiltered.";
  statusLine.classList.toggle("status--active", settings.enabled);
}

async function save(patch: Partial<Settings>): Promise<void> {
  try {
    const next = await patchSettings(patch);
    render(next);
  } catch (error) {
    // Surface the real reason rather than a generic failure string.
    statusLine.textContent = `Could not save settings: ${
      error instanceof Error ? error.message : String(error)
    }`;
    statusLine.classList.remove("status--active");
  }
}

function bind(): void {
  enabledInput.addEventListener("change", () => {
    void save({ enabled: enabledInput.checked });
  });

  badgeInput.addEventListener("change", () => {
    void save({ showTimelineBadge: badgeInput.checked });
  });

  dateInput.addEventListener("change", () => {
    const value = dateInput.value;

    // An empty or half-typed date must not be persisted: a corrupt virtual
    // date would be rejected downstream and the user would silently be left
    // with no filtering at all.
    if (!isValidCalendarDate(value)) {
      dateError.hidden = false;
      return;
    }

    dateError.hidden = true;
    void save({ virtualDate: value });
  });

  todayButton.addEventListener("click", () => {
    const today = todayAsCalendarDate();
    dateInput.value = today;
    dateError.hidden = true;
    void save({ virtualDate: today });
  });

  for (const input of document.querySelectorAll<HTMLInputElement>(
    "input[name=unknown]"
  )) {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      void save({ unknownPolicy: input.value === "show" ? "show" : "hide" });
    });
  }
}

async function main(): Promise<void> {
  buildSurfaceControls();
  bind();

  // The date picker should not offer days that cannot exist as an upload date.
  dateInput.max = todayAsCalendarDate();

  render(await loadSettings());
}

void main();
