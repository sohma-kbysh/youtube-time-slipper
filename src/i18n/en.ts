/**
 * English catalog — the source of truth for the message-key set.
 *
 * Every other locale is typed against this object, so a missing or misspelt
 * key is a compile error rather than an "undefined" appearing in the UI.
 *
 * Placeholders are `{name}` and are substituted positionally by name; keep them
 * intact in translations, and keep the surrounding wording natural for the
 * language rather than word-for-word.
 */
export const en = {
  "popup.enabled": "Timeline enabled",
  "popup.virtualPresent": "Virtual present",
  "popup.today": "Today",
  "popup.viewingAsOf": "Viewing YouTube as of {date}",
  "popup.unknownDates": "Videos with unknown dates",
  "popup.hide": "Hide",
  "popup.show": "Show",
  "popup.unknownHint":
    "Hiding is stricter: a video whose date cannot be read might be from after your virtual present.",
  "popup.surfaces": "Surfaces",
  "popup.surface.home": "Home",
  "popup.surface.search": "Search",
  "popup.surface.watchRelated": "Related",
  "popup.surface.channel": "Channels",
  "popup.surface.subscriptions": "Subscriptions",
  "popup.surface.playlists": "Playlists",
  "popup.surface.shorts": "Shorts",
  "popup.showBadge": "Show timeline badge on YouTube",
  "popup.fillFeed": "Keep loading until the feed is full",
  "popup.fillFeedHint":
    "Asks YouTube for more videos when filtering leaves the page nearly empty.",
  "popup.rangeStart": "Earliest date (optional)",
  "popup.rangeStartHint":
    "Set this to browse a period instead of everything up to your virtual present. Videos published before it are hidden too.",
  "popup.rangeClear": "Clear",
  "popup.rangeSummary": "Showing {start} to {end}",
  "popup.features": "Era features",
  "popup.hideFutureFeatures": "Hide features that did not exist yet",
  "popup.featuresHint":
    "Removes parts of YouTube — Shorts, Playables, Podcasts and so on — that launched after your virtual present. Untick one to keep it.",
  "popup.featuresNone": "Everything on this list already existed on {date}.",
  "popup.featureSince": "since {date}",
  "popup.fillTarget": "Videos to aim for",
  "popup.fillRounds": "Maximum extra loads per page",
  "popup.fillCost":
    "Higher values fill sparse pages better and cost more requests to YouTube.",
  "popup.language": "Language",
  "popup.languageAuto": "Automatic",
  "popup.statusOn": "Videos published after {date} are hidden.",
  "popup.statusOff": "Timeline off — YouTube is unfiltered.",
  "popup.invalidDate": "Enter a valid date.",
  "popup.saveError": "Could not save settings: {message}",

  "badge.tooltip": "Showing videos published on or before {date}",

  "block.titleFuture": "This video does not exist yet.",
  "block.titleBefore": "This video is outside your window.",
  "block.window": "Window",
  "block.titleUnknown": "This video has no known place in your timeline.",
  "block.virtualPresent": "Virtual present",
  "block.published": "Published",
  "block.unknown": "unknown",
  "block.goBack": "Go Back",

  "feed.sparseTitle": "Not much of this page exists yet.",
  "feed.sparseBody":
    "YouTube recommends today's videos, and most of them were published after {date}. Loading more helps, but the further back your virtual present is, the less there is to find.",
  "feed.loadMore": "Load more",
  "feed.loading": "Looking for older videos…",
  "feed.exhausted":
    "YouTube has no more videos to offer for this page. Try a later virtual present, or search for something specific.",
  "feed.visibleCount": "{visible} of {total} videos on this page are from your timeline."
} as const;

export type MessageKey = keyof typeof en;
export type Catalog = Record<MessageKey, string>;
