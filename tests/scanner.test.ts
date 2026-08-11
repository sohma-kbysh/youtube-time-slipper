// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { detectPageSurface, findCardContainer } from "../src/content/adapters";
import { collectCandidates, prioritize } from "../src/content/scanner";
import { applyCardState, needsEvaluation } from "../src/content/visibility";

const ID_A = "AAAAAAAAAAA";
const ID_B = "BBBBBBBBBBB";

function setBody(html: string): void {
  document.body.innerHTML = html;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("collectCandidates", () => {
  it("finds a video card from its link", () => {
    setBody(`
      <ytd-rich-item-renderer>
        <a href="/watch?v=${ID_A}">video</a>
      </ytd-rich-item-renderer>
    `);

    const candidates = collectCandidates(document, "home");

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.videoId).toBe(ID_A);
    expect(candidates[0]?.element.tagName.toLowerCase()).toBe("ytd-rich-item-renderer");
    expect(candidates[0]?.surface).toBe("home");
  });

  it("takes the outermost card element, so hiding removes the whole grid cell", () => {
    setBody(`
      <ytd-rich-item-renderer id="outer">
        <ytd-rich-grid-media id="inner">
          <a href="/watch?v=${ID_A}">video</a>
        </ytd-rich-grid-media>
      </ytd-rich-item-renderer>
    `);

    const [candidate] = collectCandidates(document, "home");
    expect(candidate?.element.id).toBe("outer");
  });

  it("emits one candidate per card even when several links point at it", () => {
    setBody(`
      <ytd-video-renderer>
        <a id="thumb" href="/watch?v=${ID_A}"><img /></a>
        <a id="title" href="/watch?v=${ID_A}&amp;pp=abc">Title</a>
      </ytd-video-renderer>
    `);

    expect(collectCandidates(document, "search")).toHaveLength(1);
  });

  it("recognises the card shapes used across YouTube's surfaces", () => {
    setBody(
      [
        "ytd-video-renderer",
        "ytd-compact-video-renderer",
        "ytd-grid-video-renderer",
        "ytd-playlist-video-renderer",
        "ytd-playlist-panel-video-renderer",
        "ytd-reel-item-renderer",
        "yt-lockup-view-model"
      ]
        .map((tag) => `<${tag}><a href="/watch?v=${ID_A}">v</a></${tag}>`)
        .join("")
    );

    expect(collectCandidates(document, "watchRelated")).toHaveLength(7);
  });

  it("ignores a video link that is not inside a card", () => {
    // A link in a description or an end screen: there is no card-shaped
    // element to hide, and hiding an ancestor would break the page.
    setBody(`
      <ytd-item-section-renderer>
        <p>See also <a href="/watch?v=${ID_A}">this video</a></p>
      </ytd-item-section-renderer>
    `);

    expect(collectCandidates(document, "watchRelated")).toEqual([]);
  });

  it("never treats a shelf as a card", () => {
    setBody(`
      <ytd-rich-shelf-renderer>
        <ytd-rich-item-renderer>
          <a href="/watch?v=${ID_A}">a</a>
        </ytd-rich-item-renderer>
        <ytd-rich-item-renderer>
          <a href="/watch?v=${ID_B}">b</a>
        </ytd-rich-item-renderer>
      </ytd-rich-shelf-renderer>
    `);

    const candidates = collectCandidates(document, "home");
    expect(candidates).toHaveLength(2);
    for (const candidate of candidates) {
      expect(candidate.element.tagName.toLowerCase()).toBe("ytd-rich-item-renderer");
    }
  });

  it("ignores links that address no video", () => {
    setBody(`
      <ytd-rich-item-renderer>
        <a href="/@channel">channel</a>
        <a href="/playlist?list=PL1">playlist</a>
      </ytd-rich-item-renderer>
    `);

    expect(collectCandidates(document, "home")).toEqual([]);
  });

  it("attributes Shorts cards to the Shorts surface wherever they appear", () => {
    setBody(`
      <ytm-shorts-lockup-view-model>
        <a href="/shorts/${ID_A}">short</a>
      </ytm-shorts-lockup-view-model>
    `);

    expect(collectCandidates(document, "home")[0]?.surface).toBe("shorts");
  });

  it("reads the relative-date hint from the card's metadata line", () => {
    setBody(`
      <ytd-video-renderer>
        <a href="/watch?v=${ID_A}">v</a>
        <div id="metadata-line">1.2M views • 3 years ago</div>
      </ytd-video-renderer>
    `);

    expect(collectCandidates(document, "search")[0]?.hint?.unit).toBe("year");
  });
});

describe("card recycling", () => {
  it("re-evaluates a card element whose link now points at a different video", () => {
    setBody(`
      <ytd-rich-item-renderer>
        <a id="link" href="/watch?v=${ID_A}">video</a>
      </ytd-rich-item-renderer>
    `);

    const [first] = collectCandidates(document, "home");
    const element = first!.element;

    applyCardState(element, ID_A, "visible");
    expect(needsEvaluation(element, ID_A)).toBe(false);

    // YouTube recycles the element during infinite scroll by rewriting its
    // href. A "processed" marker would leave the old verdict in place.
    document.querySelector("#link")!.setAttribute("href", `/watch?v=${ID_B}`);

    const [second] = collectCandidates(document, "home");
    expect(second?.videoId).toBe(ID_B);
    expect(second?.element).toBe(element);
    expect(needsEvaluation(element, ID_B)).toBe(true);
  });

  it("re-evaluates a card that is still pending", () => {
    setBody(`<ytd-rich-item-renderer><a href="/watch?v=${ID_A}">v</a></ytd-rich-item-renderer>`);
    const element = collectCandidates(document, "home")[0]!.element;

    applyCardState(element, ID_A, "pending");
    expect(needsEvaluation(element, ID_A)).toBe(true);
  });
});

describe("findCardContainer", () => {
  it("returns null when there is no card ancestor", () => {
    setBody(`<div><a id="link" href="/watch?v=${ID_A}">v</a></div>`);
    expect(findCardContainer(document.querySelector("#link")!)).toBeNull();
  });
});

describe("detectPageSurface", () => {
  it("maps YouTube URLs to surfaces", () => {
    const cases: Array<[string, string]> = [
      ["https://www.youtube.com/", "home"],
      ["https://www.youtube.com/results?search_query=cats", "search"],
      [`https://www.youtube.com/watch?v=${ID_A}`, "watchRelated"],
      ["https://www.youtube.com/feed/subscriptions", "subscriptions"],
      ["https://www.youtube.com/@someone/videos", "channel"],
      ["https://www.youtube.com/channel/UC123/videos", "channel"],
      ["https://www.youtube.com/playlist?list=PL1", "playlists"],
      [`https://www.youtube.com/shorts/${ID_A}`, "shorts"],
      ["https://www.youtube.com/account", "other"]
    ];

    for (const [href, expected] of cases) {
      expect(detectPageSurface(new URL(href)), href).toBe(expected);
    }
  });
});

describe("prioritize", () => {
  it("puts older-looking cards first without dropping any", () => {
    setBody(`
      <ytd-video-renderer>
        <a href="/watch?v=${ID_A}">v</a>
        <div id="metadata-line">2 hours ago</div>
      </ytd-video-renderer>
      <ytd-video-renderer>
        <a href="/watch?v=${ID_B}">v</a>
        <div id="metadata-line">9 years ago</div>
      </ytd-video-renderer>
    `);

    const ordered = prioritize(collectCandidates(document, "search"));
    expect(ordered.map((card) => card.videoId)).toEqual([ID_B, ID_A]);
  });
});
