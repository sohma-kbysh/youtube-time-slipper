# YouTube Time Slipper

A Chrome Manifest V3 extension that lets you set a "virtual present" date
and browse YouTube as if that were today. Videos published after your
chosen date are kept out of the browsing surface.

## What it is

You configure a virtual date, `D_virtual`, in the extension's popup.
While the extension is enabled, YouTube pages are scanned for video
cards, each card's publication date is resolved, and any video whose
publication date is later than `D_virtual` is hidden before it can be
shown to you. It works against the live, current YouTube site and the
live, current YouTube recommender — it does not simulate or reconstruct
a past version of either.

## The invariant

> When enabled, no video whose known publication date is later than the
> configured virtual date may be presented as available.

- The date boundary is **inclusive**: a video published exactly on
  `D_virtual` is visible.
- In **strict mode**, videos whose publication date cannot be determined
  are also hidden ("fail closed") rather than shown by default.
- Dates are compared as whole calendar dates (`YYYY-MM-DD`), not
  timestamps — see [How it works](#how-it-works).

## What it does not do

This is explicitly **not** a recreation of historical YouTube. v1 does
not restore:

- the old YouTube UI from any past era
- the old recommendation algorithm (recommendations come from today's
  YouTube, applied to a historical video set)
- old view counts or like counts
- old comments
- old subscriber counts
- videos that have since been deleted or made private
- historical search ranking

## Install / build

Requires Node.js and npm.

```sh
npm install
npm run build     # builds the extension into dist/
npm run dev        # build in watch mode
npm test           # run the Vitest test suite
```

To load the built extension in Chrome:

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `dist/` directory.

## Usage

1. Click the extension icon to open the popup.
2. Set `D_virtual`, the virtual present date.
3. Switch **Timeline enabled** on. Under **Videos with unknown dates**,
   `Hide` is the strict default; `Show` relaxes it. **Surfaces** lets you
   exempt individual parts of YouTube from filtering.
4. Browse YouTube normally. Cards for videos published after
   `D_virtual` are removed from view before they render; cards whose
   date is unknown are removed too unless you chose `Show`.
5. Direct navigation to a future video's watch page
   (`/watch?v=<id>`) is blocked and replaced with an overlay stating
   the configured virtual present and the video's real publication
   date.

## How it works

```text
┌────────────┐   settings    ┌────────────────────┐
│   Popup    │ ────────────> │ chrome.storage.local│
│ (settings) │               └──────────┬──────────┘
└────────────┘                          │
                                         │ read settings
                                         v
┌───────────────────────────────────────────────────────────┐
│ Content script (runs on youtube.com pages)                 │
│  - DOM scanner (MutationObserver)                           │
│  - video-ID extractor                                       │
│  - visibility state machine per card                        │
│  - watch-page guard (blocks /watch?v=<future id>)            │
└───────────────────────────┬─────────────────────────────────┘
                             │ chrome.runtime messaging
                             │ ("resolve publication date for id")
                             v
┌───────────────────────────────────────────────────────────┐
│ Service worker                                              │
│  - publication resolver                                     │
│  - fetch queue (max 6 concurrent, in-flight de-duplication) │
│  - IndexedDB cache (positive: indefinite, unknown: 24h,      │
│    keyed with a parser version)                              │
└───────────────────────────┬─────────────────────────────────┘
                             │ fetch (only to youtube.com)
                             v
                  https://www.youtube.com/watch?v=<id>
```

**Resolving a publication date.** The service worker fetches
`https://www.youtube.com/watch?v=<id>` and extracts a machine-readable
date from the page: the `<meta itemprop="datePublished">` /
`<meta itemprop="uploadDate">` tags, or the `publishDate` / `uploadDate`
fields in the page's embedded JSON. The result is cached in IndexedDB.
Positive resolutions (a date was found) are cached indefinitely;
negative resolutions (no date could be found) are cached for 24 hours
so they get retried. Every cache record carries the version of the
parser that produced it, so if the parser is later improved, previously
cached "unknown" results are re-resolved instead of being trusted
forever.

**Date comparison.** Publication dates and `D_virtual` are compared as
calendar tuples (year, month, day) rather than by constructing
`Date` objects, specifically to avoid timezone-related off-by-one drift
between "the video's date" and "your local date."

**Card state machine.** Each scanned card moves through a small state
machine — `pending` (hidden) → `visible`, `future` (hidden), or
`unknown` (hidden only in strict mode) — instead of appearing and then
being hidden a moment later. This is what prevents a future video from
flashing on screen before it gets filtered out.

**Keeping the page coherent.** Removing cards one at a time leaves the
scaffolding behind, so a shelf whose videos are all hidden is collapsed
along with them — no orphaned headings, "Show less" buttons or blank
bands. Because today's recommendations are mostly recent, a distant
virtual present can still empty a feed; with **Keep loading until the
feed is full** enabled (the default), the extension then asks YouTube
for more items — up to 25 requests per page, spaced out, stopping early
once ~20 videos are visible or YouTube stops producing new ones. It only
moves the viewport while the page is nearly empty, and stops doing so
once you scroll yourself. If the feed still comes up short, a panel
explains why and offers a **Load more** button rather than leaving a
blank screen.

This never relaxes the filter — it only changes how much material the
filter is applied to.

## Languages

The interface is available in English, 日本語, 简体中文, 한국어, Español
and Deutsch. The default follows your browser's language preferences, and
the popup has a selector to override it — useful because Chrome's UI
language and your YouTube content language are often not the same.

## Supported YouTube surfaces

The content script scans video cards on:

- the home feed
- search results
- the watch page's related/"up next" video list
- subscriptions
- channel pages
- playlists
- Shorts

Direct navigation to a future video's own watch page is separately
guarded and blocked with an overlay, regardless of which surface the
navigation came from.

## Limitations

- Because a video's publication date is only known *after* the watch
  page navigation has begun and the service worker has resolved it, the
  extension cannot guarantee that zero bytes of a future video's
  metadata are ever fetched by the browser during that brief window.
  What it does guarantee is that the video is not presented as viewable
  in the browsing interface — the watch page is replaced with a
  blocking overlay before playback is shown.
- v1 does not restore old view/like counts, old comments, old
  subscriber counts, the historical UI, the historical recommendation
  algorithm, historical search ranking, or deleted/private videos (see
  [What it does not do](#what-it-does-not-do)).
- The first visit to a feed is slow to fill in. Every unseen video costs
  one watch-page fetch, six at a time, and cards stay hidden until their
  date comes back — that is the cost of never flashing a future video.
  Subsequent visits are served from the IndexedDB cache and need no
  network at all.
- The further back your virtual present is, the thinner every feed gets.
  The extension filters what today's recommender offers; it cannot make
  YouTube recommend 2012 videos. Refilling exhausts what YouTube is
  willing to hand over, which helps for cutoffs a few years back and much
  less for a decade. Search and channel pages are the reliable way to
  reach genuinely old material — a channel's back catalogue is all still
  there, and the filter simply stops it at your date.
- Publication-date resolution depends on YouTube continuing to expose
  machine-readable date metadata on the watch page in its current form;
  if YouTube changes that markup, resolution can start failing until
  the parser is updated (cached "unknown" results retry automatically
  after 24 hours, or sooner once a new parser version ships).

## Privacy

- The extension is entirely client-side. There is no server backend, no
  analytics, no telemetry, no account or sign-in, and no remotely
  hosted or dynamically loaded code.
- The only network requests the extension itself makes are to
  `youtube.com`, to read a given video's publication date.
- Your settings (including `D_virtual`) are stored in
  `chrome.storage.local`, and the resolved-date cache is stored in
  IndexedDB. Both stay on your machine.
- Permissions requested: `storage`, and the host permission
  `https://www.youtube.com/*`. Nothing else.

## Development / testing

- Language: TypeScript.
- Bundler: esbuild.
- Tests: Vitest with jsdom.
- Popup UI: vanilla HTML/CSS (no framework — no React, Vue, WXT, or
  Plasmo).

```sh
npm install
npm run dev        # watch-mode build
npm test           # run the test suite
npm run typecheck  # tsc --noEmit
npm run build      # production build into dist/
npm run icons      # regenerate public/icons from scripts/gen-icons.mjs
```

The tests cover each subsystem in isolation (date comparison, policy,
video-ID extraction, the metadata parser against watch-page fixtures,
the cache's freshness rules, the fetch queue) plus two end-to-end passes
that run the real content script against a stubbed Chrome API: one over
a feed, one over a watch page.

All YouTube-specific selectors live in `src/content/adapters.ts`. When
YouTube changes its markup and a surface stops being filtered, that file
should be the only one that needs editing.

## Roadmap

Not implemented in v1; under consideration for v2:

- An optional exact-timestamp mode using the YouTube Data API's
  `snippet.publishedAt` field, for higher-precision filtering than
  calendar-date comparison.
- A running virtual clock, where virtual time advances on its own,
  faster than real time, instead of staying pinned to a fixed
  `D_virtual`.
- A historical discovery mode, for surfacing videos from a chosen past
  period rather than only filtering the current recommender's output.

## License

MIT. See [LICENSE](./LICENSE). Design-reference acknowledgements for
prior art are listed in
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
