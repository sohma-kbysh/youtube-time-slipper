/**
 * Stable mounting point for extension-owned feed UI.
 *
 * YouTube owns the contents inside its feed renderer and may reconcile or
 * replace those nodes at any time. Mounting our panels directly in `#contents`
 * makes them part of that reconciliation, which causes visible removal and
 * reinsertion. Keep one shared host immediately before the renderer instead.
 */

import {
  FEED_CONTAINER_SELECTOR,
  isInInactiveTree
} from "./adapters.js";

export const FEED_UI_HOST_CLASS = "time-slipper-feed-ui";

const FEED_RENDERER_SELECTOR = [
  "ytd-rich-grid-renderer",
  "ytd-section-list-renderer",
  "ytd-watch-next-secondary-results-renderer"
].join(", ");

let host: HTMLElement | null = null;

interface MountPoint {
  parent: HTMLElement;
  renderer: HTMLElement;
}

/** Mount one extension-owned panel without putting it in YouTube's `#contents`. */
export function mountFeedUi(element: HTMLElement): boolean {
  const point = findMountPoint();
  if (!point) return false;

  const sharedHost = getOrCreateHost();

  // Do not move an already-correct host on every scan. Inserting it again would
  // itself wake the page MutationObserver and recreate the flicker this host is
  // intended to prevent.
  if (
    sharedHost.parentElement !== point.parent ||
    sharedHost.nextElementSibling !== point.renderer
  ) {
    point.parent.insertBefore(sharedHost, point.renderer);
  }

  if (element.parentElement !== sharedHost) {
    sharedHost.appendChild(element);
  }

  return true;
}

/** Remove one panel and release the shared host only when its last user leaves. */
export function unmountFeedUi(element: HTMLElement | null): void {
  element?.remove();

  const sharedHost = currentHost();
  if (sharedHost && sharedHost.childElementCount === 0) {
    sharedHost.remove();
    host = null;
  }
}

/** Assign text only when it really changed, keeping repeated renders inert. */
export function setTextIfChanged(element: Element | null, value: string): void {
  if (element && element.textContent !== value) {
    element.textContent = value;
  }
}

function findMountPoint(): MountPoint | null {
  // A selector list passed to querySelector returns the first match in document
  // order, not the first preferred selector. YouTube has many repeated
  // `#contents` nodes, so honour the adapter's priority explicitly and use the
  // bare fallback only when no recognised feed contains one.
  let contents: HTMLElement | null = null;
  let fallback: HTMLElement | null = null;
  for (const selector of FEED_CONTAINER_SELECTOR.split(",")) {
    const matches = document.querySelectorAll<HTMLElement>(selector.trim());
    fallback ??= matches[0] ?? null;
    contents = [...matches].find((candidate) => !isInInactiveTree(candidate)) ?? null;
    if (contents) break;
  }
  contents ??= fallback;
  if (!contents) return null;

  // The fallback is useful for simpler surfaces and test fixtures that expose
  // only `#contents`: even there, the host remains its sibling, never its child.
  const renderer = contents.closest<HTMLElement>(FEED_RENDERER_SELECTOR) ?? contents;
  const parent = renderer.parentElement;
  return parent ? { parent, renderer } : null;
}

function getOrCreateHost(): HTMLElement {
  const existing = currentHost();
  if (existing) return existing;

  host = document.createElement("div");
  host.className = FEED_UI_HOST_CLASS;
  host.setAttribute("data-time-slipper-feed-ui", "");
  return host;
}

function currentHost(): HTMLElement | null {
  if (host) return host;
  host = document.querySelector<HTMLElement>(`.${FEED_UI_HOST_CLASS}`);
  return host;
}
