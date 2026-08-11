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

import { isValidCalendarDate, todayAsCalendarDate } from "../core/date.js";
import {
  LANGUAGES,
  LANGUAGE_NAMES,
  browserLanguages,
  createTranslator,
  resolveLanguage,
  type Language,
  type MessageKey,
  type Translator
} from "../core/i18n.js";
import {
  MESSAGE_VERIFY_API_KEY,
  isApiKeyVerifiedResponse
} from "../core/messages.js";
import type { ConfigurableSurface, Settings } from "../core/types.js";
import { ERA_FEATURES } from "../content/era.js";
import { DAILY_QUOTA, type EraSearchOrder } from "../background/youtube-api.js";
import { readUsage } from "../storage/api-usage.js";
import {
  API_ORDERS,
  CONFIGURABLE_SURFACES,
  loadSettings,
  patchSettings
} from "../storage/settings.js";

/** The optional host permission the API needs. */
const API_ORIGIN_PATTERN = "https://www.googleapis.com/*";

const API_ORDER_KEYS: Record<EraSearchOrder, MessageKey> = {
  viewCount: "popup.apiOrderViewCount",
  relevance: "popup.apiOrderRelevance",
  date: "popup.apiOrderDate",
  rating: "popup.apiOrderRelevance"
};

const API_ERROR_KEYS: Record<string, MessageKey> = {
  "invalid-key": "popup.apiErrorInvalidKey",
  "not-enabled": "popup.apiErrorNotEnabled",
  quota: "popup.apiErrorQuota",
  forbidden: "popup.apiErrorNotEnabled",
  network: "popup.apiErrorNetwork",
  "no-permission": "popup.apiErrorPermission"
};

const SURFACE_KEYS: Record<ConfigurableSurface, MessageKey> = {
  home: "popup.surface.home",
  search: "popup.surface.search",
  watchRelated: "popup.surface.watchRelated",
  channel: "popup.surface.channel",
  subscriptions: "popup.surface.subscriptions",
  playlists: "popup.surface.playlists",
  shorts: "popup.surface.shorts"
};

const enabledInput = required<HTMLInputElement>("#enabled");
const dateInput = required<HTMLInputElement>("#virtual-date");
const todayButton = required<HTMLButtonElement>("#today");
const rangeStartInput = required<HTMLInputElement>("#range-start");
const rangeClearButton = required<HTMLButtonElement>("#range-clear");
const fillTargetInput = required<HTMLInputElement>("#fill-target");
const fillRoundsInput = required<HTMLInputElement>("#fill-rounds");
const hideFeaturesInput = required<HTMLInputElement>("#hide-future-features");
const discoverInput = required<HTMLInputElement>("#discover-era");
const featuresContainer = required<HTMLElement>("#features");
const apiKeyInput = required<HTMLInputElement>("#api-key");
const apiVerifyButton = required<HTMLButtonElement>("#api-verify");
const apiRemoveButton = required<HTMLButtonElement>("#api-remove");
const apiStatusLine = required<HTMLElement>("#api-status");
const apiOrderSelect = required<HTMLSelectElement>("#api-order");
const apiUsageLine = required<HTMLElement>("#api-usage");
const dateSummary = required<HTMLElement>("#virtual-date-summary");
const dateError = required<HTMLElement>("#virtual-date-error");
const badgeInput = required<HTMLInputElement>("#badge");
const fillFeedInput = required<HTMLInputElement>("#fill-feed");
const languageSelect = required<HTMLSelectElement>("#language");
const surfacesContainer = required<HTMLElement>("#surfaces");
const statusLine = required<HTMLElement>("#status");

let t: Translator = createTranslator("en");

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
    text.dataset["i18n"] = SURFACE_KEYS[surface];

    label.append(input, text);
    surfacesContainer.appendChild(label);
  }
}

function buildLanguageOptions(): void {
  for (const language of LANGUAGES) {
    const option = document.createElement("option");
    option.value = language;
    // Each language is named in itself, so the list stays usable even when the
    // current UI language is one the reader cannot read.
    option.textContent =
      language === "auto" ? "" : LANGUAGE_NAMES[language];
    if (language === "auto") option.dataset["i18n"] = "popup.languageAuto";
    languageSelect.appendChild(option);
  }

  languageSelect.addEventListener("change", () => {
    void save({ language: languageSelect.value as Language });
  });
}

/** Fill in every element carrying a `data-i18n` key. */
function applyTranslations(): void {
  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = element.dataset["i18n"] as MessageKey | undefined;
    if (key) element.textContent = t(key);
  }

  document.documentElement.lang = t.language;
}

function readSurfaces(): Record<ConfigurableSurface, boolean> {
  const surfaces = {} as Record<ConfigurableSurface, boolean>;
  for (const input of surfaceInputs()) {
    const surface = input.dataset["surface"] as ConfigurableSurface | undefined;
    if (surface) surfaces[surface] = input.checked;
  }
  return surfaces;
}

/**
 * List the features that postdate the virtual present, each with the date it
 * appeared. Ticked means hidden; unticking keeps that one feature.
 *
 * Product names are shown as YouTube writes them, untranslated — "Shorts" and
 * "Playables" are the same word in every locale YouTube ships.
 */
function renderFeatures(settings: Settings): void {
  featuresContainer.textContent = "";

  const anachronistic = ERA_FEATURES.filter(
    (feature) => feature.since > settings.virtualDate
  );

  if (anachronistic.length === 0) {
    const note = document.createElement("p");
    note.className = "field__hint";
    note.textContent = t("popup.featuresNone", { date: t.date(settings.virtualDate) });
    featuresContainer.appendChild(note);
    return;
  }

  const allowed = new Set(settings.allowedFeatures);

  for (const feature of anachronistic) {
    const label = document.createElement("label");
    label.className = "check";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset["feature"] = feature.id;
    input.checked = !allowed.has(feature.id);
    input.disabled = !settings.hideFutureFeatures;
    input.addEventListener("change", () => {
      void save({ allowedFeatures: readAllowedFeatures() });
    });

    const text = document.createElement("span");
    text.textContent = feature.label;

    const since = document.createElement("span");
    since.className = "check__meta";
    since.textContent = t("popup.featureSince", { date: feature.since });

    label.append(input, text, since);
    featuresContainer.appendChild(label);
  }
}

function readAllowedFeatures(): string[] {
  const allowed: string[] = [];

  for (const input of featuresContainer.querySelectorAll<HTMLInputElement>(
    "input[type=checkbox]"
  )) {
    const id = input.dataset["feature"];
    if (id && !input.checked) allowed.push(id);
  }

  return allowed;
}

function render(settings: Settings): void {
  t = createTranslator(resolveLanguage(settings.language, browserLanguages()));
  applyTranslations();

  enabledInput.checked = settings.enabled;
  dateInput.value = settings.virtualDate;
  rangeStartInput.value = settings.rangeStart ?? "";
  rangeStartInput.max = settings.virtualDate;
  badgeInput.checked = settings.showTimelineBadge;
  fillFeedInput.checked = settings.fillFeed;
  fillTargetInput.value = String(settings.fillTargetVisible);
  fillRoundsInput.value = String(settings.fillMaxRounds);
  fillTargetInput.disabled = !settings.fillFeed;
  fillRoundsInput.disabled = !settings.fillFeed;
  hideFeaturesInput.checked = settings.hideFutureFeatures;
  discoverInput.checked = settings.discoverEra;
  apiKeyInput.value = settings.apiKey;
  apiOrderSelect.value = settings.apiOrder;
  languageSelect.value = settings.language;

  renderFeatures(settings);

  for (const input of document.querySelectorAll<HTMLInputElement>(
    "input[name=unknown]"
  )) {
    input.checked = input.value === settings.unknownPolicy;
  }

  for (const input of surfaceInputs()) {
    const surface = input.dataset["surface"] as ConfigurableSurface | undefined;
    if (surface) input.checked = settings.surfaces[surface];
  }

  dateSummary.textContent = !isValidCalendarDate(settings.virtualDate)
    ? ""
    : settings.rangeStart
      ? t("popup.rangeSummary", {
          start: t.date(settings.rangeStart),
          end: t.date(settings.virtualDate)
        })
      : t("popup.viewingAsOf", { date: t.date(settings.virtualDate) });

  statusLine.textContent = settings.enabled
    ? t("popup.statusOn", { date: t.date(settings.virtualDate) })
    : t("popup.statusOff");
  statusLine.classList.toggle("status--active", settings.enabled);
}

async function save(patch: Partial<Settings>): Promise<void> {
  try {
    const next = await patchSettings(patch);
    render(next);
  } catch (error) {
    // Surface the real reason rather than a generic failure string.
    statusLine.textContent = t("popup.saveError", {
      message: error instanceof Error ? error.message : String(error)
    });
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

  fillFeedInput.addEventListener("change", () => {
    void save({ fillFeed: fillFeedInput.checked });
  });

  apiVerifyButton.addEventListener("click", () => {
    void verifyAndSaveKey();
  });

  apiRemoveButton.addEventListener("click", () => {
    apiKeyInput.value = "";
    setApiStatus("");
    void save({ apiKey: "" });
  });

  discoverInput.addEventListener("change", () => {
    void save({ discoverEra: discoverInput.checked });
  });

  hideFeaturesInput.addEventListener("change", () => {
    void save({ hideFutureFeatures: hideFeaturesInput.checked });
  });

  // Out-of-range or empty numbers are normalised on the way into storage, so
  // the field cannot be left in a state that disables refilling by accident.
  fillTargetInput.addEventListener("change", () => {
    void save({ fillTargetVisible: Number(fillTargetInput.value) });
  });

  fillRoundsInput.addEventListener("change", () => {
    void save({ fillMaxRounds: Number(fillRoundsInput.value) });
  });

  rangeStartInput.addEventListener("change", () => {
    const value = rangeStartInput.value;

    if (value === "") {
      void save({ rangeStart: null });
      return;
    }

    if (!isValidCalendarDate(value)) {
      dateError.hidden = false;
      return;
    }

    dateError.hidden = true;
    void save({ rangeStart: value });
  });

  rangeClearButton.addEventListener("click", () => {
    rangeStartInput.value = "";
    void save({ rangeStart: null });
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

function buildApiOrderOptions(): void {
  for (const order of API_ORDERS) {
    const option = document.createElement("option");
    option.value = order;
    option.dataset["i18n"] = API_ORDER_KEYS[order];
    apiOrderSelect.appendChild(option);
  }

  apiOrderSelect.addEventListener("change", () => {
    void save({ apiOrder: apiOrderSelect.value as EraSearchOrder });
  });
}

function setApiStatus(message: string, isError = false): void {
  apiStatusLine.textContent = message;
  apiStatusLine.classList.toggle("status--error", isError);
  apiStatusLine.classList.toggle("status--active", !isError && message !== "");
}

async function refreshUsage(): Promise<void> {
  const usage = await readUsage();
  apiUsageLine.textContent = t("popup.apiUsage", {
    units: usage.units,
    limit: DAILY_QUOTA
  });
}

/**
 * Verify a key and store it.
 *
 * The host permission is optional and requested here, inside the click, since
 * Chrome only grants permission requests during a user gesture. Asking at this
 * moment also means someone who never uses the API is never asked at all.
 */
async function verifyAndSaveKey(): Promise<void> {
  const key = apiKeyInput.value.trim();

  if (key === "") {
    await save({ apiKey: "" });
    setApiStatus("");
    return;
  }

  apiVerifyButton.disabled = true;
  setApiStatus(t("popup.apiChecking"));

  try {
    const granted = await chrome.permissions.request({
      origins: [API_ORIGIN_PATTERN]
    });

    if (!granted) {
      setApiStatus(t("popup.apiErrorPermission"), true);
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_VERIFY_API_KEY,
      apiKey: key
    });

    if (!isApiKeyVerifiedResponse(response)) {
      setApiStatus(t("popup.apiErrorUnexpected", { detail: String(response) }), true);
      return;
    }

    if (!response.ok) {
      const messageKey = API_ERROR_KEYS[response.errorKind ?? ""];
      setApiStatus(
        messageKey
          ? t(messageKey)
          : t("popup.apiErrorUnexpected", { detail: response.detail ?? "" }),
        true
      );
      return;
    }

    // Only a working key is stored, so a typo cannot sit in settings silently
    // failing every search.
    await save({ apiKey: key });
    setApiStatus(t("popup.apiOk"));
    await refreshUsage();
  } catch (error) {
    setApiStatus(
      t("popup.apiErrorUnexpected", {
        detail: error instanceof Error ? error.message : String(error)
      }),
      true
    );
  } finally {
    apiVerifyButton.disabled = false;
  }
}

async function main(): Promise<void> {
  buildSurfaceControls();
  buildLanguageOptions();
  buildApiOrderOptions();
  bind();

  // The date picker should not offer days that cannot exist as an upload date.
  dateInput.max = todayAsCalendarDate();

  render(await loadSettings());
  await refreshUsage();
}

void main();
