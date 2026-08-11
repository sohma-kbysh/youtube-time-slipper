# Third-Party Notices

YouTube Time Slipper does not include, vendor, or bundle any third-party
source code. It is an independent implementation written from scratch in
TypeScript, using no runtime dependencies beyond the browser's own
extension platform. Everything below is an acknowledgement of prior art
that informed the design — not a list of included code.

## Design references

### Time Machine for YouTube (Firefox extension, by Zaki Aslam)

This project's approach to two design problems was informed by *Time
Machine for YouTube*:

- The general concept of a user-configurable cutoff date that filters
  which videos are presented as available.
- Using a `MutationObserver`-based approach to detect and re-scan video
  cards as YouTube's single-page app mutates the DOM.

No code from this project was copied. It is cited here purely as an
influence on the feature idea and the DOM-scanning technique.

**Licensing note:** the project's GitHub README states an MIT license,
but its listing on Mozilla Add-ons (addons.mozilla.org) shows MPL-2.0.
These two statements are inconsistent. Because of that discrepancy, its
actual license terms have not been treated as settled here, and no code
from it has been reused. Anyone wishing to reuse code from that project
should confirm its actual license directly with the author (Zaki Aslam)
first.

### yt-times (MIT)

This project's approach to two other design problems was informed by
*yt-times*:

- Resolving a video's exact publication date by reading the
  machine-readable `datePublished` metadata (and related fields) present
  on a YouTube watch page, rather than relying on the relative,
  human-facing "X years ago" text.
- The broader survey of YouTube's video card renderer element types,
  used as a reference for which DOM elements represent a "video card"
  across YouTube's various surfaces (home, search, channel, etc.).

`yt-times` is MIT-licensed. No code from it has been copied into this
project; it is cited here as a design reference only.

## If code is copied in later

If, in a future revision, source code from either of the above projects
(or any other third-party project) is actually copied into this
repository rather than merely used as a reference, the corresponding
license text must be added to this file at that time, along with
attribution sufficient to satisfy that license's requirements.
