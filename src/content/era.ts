/**
 * Hiding parts of YouTube that did not exist yet.
 *
 * Filtering videos by date leaves the *product* untouched: a 2012 timeline
 * still has a Shorts rail in the sidebar, a Playables shelf and a Podcasts
 * entry. Those are as anachronistic as the videos are, so each one carries the
 * date it appeared and is removed when the virtual present predates it.
 *
 * Two deliberate limits:
 *
 *  - This hides interface elements. It does not rebuild the 2012 interface —
 *    see the README. Removing what did not exist is achievable; recreating
 *    what did is not.
 *  - The dates below are the public launch dates, and several rolled out over
 *    months or by region. They are documented per entry and are approximate by
 *    nature; being a few weeks off changes only whether a rail disappears at a
 *    cutoff very close to its launch.
 *
 * Matching is by URL and element name, never by visible text, so it works the
 * same whatever language YouTube is displayed in.
 */

import { compareCalendarDates, isValidCalendarDate } from "../core/date.js";
import type { CalendarDate, Settings } from "../core/types.js";

export const ERA_ATTR = "data-time-slipper-era";

export interface EraFeature {
  id: string;
  /** YouTube's own product name; kept untranslated, as YouTube keeps it. */
  label: string;
  /** First public availability. */
  since: CalendarDate;
  /** Notes on the date, shown in no UI but kept next to the value it explains. */
  note?: string;
  /** Elements removed outright. */
  elements?: string[];
  /** Links whose surrounding entry, shelf or chip is removed. */
  links?: string[];
}

/** Wrappers a matched link belongs to; the outermost match wins. */
const ENTRY_SELECTOR = [
  "ytd-guide-entry-renderer",
  "ytd-mini-guide-entry-renderer",
  "ytd-rich-shelf-renderer",
  "ytd-reel-shelf-renderer",
  "ytd-rich-section-renderer",
  "ytd-shelf-renderer",
  "yt-chip-cloud-chip-renderer",
  "tp-yt-paper-tab",
  "yt-tab-shape"
].join(", ");

export const ERA_FEATURES: EraFeature[] = [
  {
    id: "shorts",
    label: "Shorts",
    since: "2020-09-14",
    note: "US beta September 2020; worldwide July 2021.",
    links: ["/shorts"],
    elements: [
      "ytd-reel-shelf-renderer",
      "ytd-rich-shelf-renderer[is-shorts]",
      "ytm-shorts-lockup-view-model",
      "ytm-shorts-lockup-view-model-v2",
      "ytd-reel-item-renderer",
      "grid-shelf-view-model"
    ]
  },
  {
    id: "playables",
    label: "Playables",
    since: "2024-05-15",
    note: "Premium experiment from September 2023; general availability May 2024.",
    links: ["/playables"]
  },
  {
    id: "podcasts",
    label: "Podcasts",
    since: "2023-04-25",
    links: ["/podcasts", "/feed/podcasts"]
  },
  {
    id: "courses",
    label: "Courses",
    since: "2023-05-01",
    links: ["/feed/courses"]
  },
  {
    id: "hype",
    label: "Hype",
    since: "2024-09-18",
    elements: ["hype-button-view-model", "#hype-button"]
  },
  {
    id: "clips",
    label: "Clips",
    since: "2021-04-01",
    elements: ["#clip-button", "ytd-clip-creation-renderer"]
  },
  {
    id: "memberships",
    label: "Channel memberships",
    since: "2018-06-21",
    elements: ["#sponsor-button", "ytd-sponsorships-live-chat-header-renderer"]
  },
  {
    id: "communityPosts",
    label: "Community posts",
    since: "2016-09-13",
    elements: [
      "ytd-post-renderer",
      "ytd-backstage-post-thread-renderer",
      "ytd-backstage-items"
    ]
  },
  {
    id: "explore",
    label: "Explore",
    since: "2020-08-01",
    links: ["/feed/explore"]
  },
  {
    id: "trending",
    label: "Trending",
    since: "2015-12-10",
    links: ["/feed/trending"]
  },
  {
    id: "filterChips",
    label: "Topic filter chips",
    since: "2019-08-01",
    note: "The chip bar above the home feed.",
    elements: ["ytd-feed-filter-chip-bar-renderer", "yt-chip-cloud-renderer"]
  },
  {
    id: "youtubeMusic",
    label: "YouTube Music",
    since: "2018-05-22",
    links: ["https://music.youtube.com/"]
  },
  {
    id: "gaming",
    label: "YouTube Gaming",
    since: "2015-08-26",
    links: ["/gaming"]
  },
  {
    id: "movies",
    label: "Movies & TV",
    since: "2011-05-09",
    links: ["/feed/storefront", "/movies"]
  },
  {
    id: "liveStreaming",
    label: "Live streaming",
    since: "2011-04-08",
    links: ["/live"],
    elements: ["ytd-live-chat-frame"]
  }
];

/**
 * The features that did not exist at the virtual present and that the user has
 * not chosen to keep.
 */
export function anachronisticFeatures(
  settings: Pick<Settings, "virtualDate" | "hideFutureFeatures" | "allowedFeatures">
): EraFeature[] {
  if (!settings.hideFutureFeatures) return [];
  if (!isValidCalendarDate(settings.virtualDate)) return [];

  const allowed = new Set(settings.allowedFeatures ?? []);

  return ERA_FEATURES.filter((feature) => {
    if (allowed.has(feature.id)) return false;
    // Strictly after the virtual present: a feature launched *on* the day
    // existed on that day.
    return compareCalendarDates(feature.since, settings.virtualDate) > 0;
  });
}

/**
 * Mark every anachronistic element, and unmark anything that has become
 * contemporary again because the date moved.
 *
 * Like card filtering, this only sets an attribute; the stylesheet does the
 * hiding, so switching the extension off restores the page exactly.
 */
export function applyEraFeatures(
  settings: Pick<Settings, "virtualDate" | "hideFutureFeatures" | "allowedFeatures">,
  root: ParentNode = document
): { hidden: number; features: string[] } {
  const features = anachronisticFeatures(settings);
  const marked = new Set<HTMLElement>();

  for (const feature of features) {
    for (const selector of feature.elements ?? []) {
      for (const element of queryAll(root, selector)) {
        element.setAttribute(ERA_ATTR, feature.id);
        marked.add(element);
      }
    }

    for (const href of feature.links ?? []) {
      for (const link of queryAll(root, linkSelector(href))) {
        const target = link.closest<HTMLElement>(ENTRY_SELECTOR) ?? link;
        target.setAttribute(ERA_ATTR, feature.id);
        marked.add(target);
      }
    }
  }

  // Anything marked by an earlier pass that no longer qualifies comes back.
  for (const element of root.querySelectorAll<HTMLElement>(`[${ERA_ATTR}]`)) {
    if (!marked.has(element)) element.removeAttribute(ERA_ATTR);
  }

  return { hidden: marked.size, features: features.map((feature) => feature.id) };
}

export function resetEraFeatures(root: ParentNode = document): void {
  for (const element of root.querySelectorAll<HTMLElement>(`[${ERA_ATTR}]`)) {
    element.removeAttribute(ERA_ATTR);
  }
}

/**
 * Match a link by exact path, by path with a query string, and by its absolute
 * form — YouTube emits all three for the same destination.
 */
function linkSelector(href: string): string {
  if (href.startsWith("http")) {
    return `a[href^="${href}"]`;
  }

  return [
    `a[href="${href}"]`,
    `a[href^="${href}?"]`,
    `a[href="https://www.youtube.com${href}"]`
  ].join(", ");
}

function queryAll(root: ParentNode, selector: string): HTMLElement[] {
  try {
    return [...root.querySelectorAll<HTMLElement>(selector)];
  } catch {
    // A selector YouTube's DOM (or an old browser) chokes on must not take the
    // rest of the pass down with it.
    return [];
  }
}
