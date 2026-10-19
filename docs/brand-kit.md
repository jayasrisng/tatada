# Tatada brand kit

Tatada helps stars live more and scroll less. The experience is personal, curious, and calm. A star is a person, never a gender, status tier, or unexplained map location.

## Palette

| Role | Blackboard | Paper |
|---|---|---|
| Main surface | `#191A1D` | `#F7F4ED` |
| Recessed surface | `#131417` | `#FAF8F2` |
| Raised surface | `#23252A` | `#EEE9DF` |
| Primary ink | `#F1EDE4` | `#292E32` |
| Secondary ink | `#C4C0B7` | `#525B60` |
| Muted readable ink | `#A09E98` | `#626B70` |
| Star / primary accent | `#E8CB88` | `#76551E` |
| Blue / planned | `#A8C5D0` | `#315F78` |
| Sage / visited | `#B4C6AD` | `#43684C` |
| Rose / personal | `#DCA8AC` | `#954B61` |
| Map land | `#35373B` | `#DDDCD1` |
| Map border | `#686B70` | `#8C958E` |
| Map ocean | `#202226` | `#EDF0EB` |
| Visited fill | `#A8BDA5` | `#7D9A79` |
| Planned fill | `#424B59` | `#C5D8DF` |

Tokens live in `src/styles/brand.css`. Map fill colors carry geometry rather than text; primary/secondary ink carry readable labels. Selected countries add a stronger stroke. Planned countries use a dashed border so meaning does not rely on color alone. Use at most one main accent per screen.

## Typography

- **Cabin Sketch 700:** the existing Tatada wordmark only. Do not use it for paragraphs.
- **Caveat 500/700:** short headings, 30–48 px, generous whitespace.
- **Patrick Hand 400:** readable body and controls, 18 px, at least 1.4 line-height.
- System sans-serif at 10–12 px is reserved for map attribution and technical identifiers.
- Printable PDFs use a clean paper layout and supported PDF fonts, not a black page.

The distributable fonts remain local fontsource assets with their package licenses. No new remote font requests are required.

## Marks and icons

The live wordmark remains the app's existing `tatada` lettering. The companion star mark is in `public/brand/`: charcoal and paper variants, using the corresponding accent colors. Never distort, spin continuously, or use it as a user's physical location. Keep one mark-width of breathing room.

Doodle icons use 1.5–2 px strokes, accessible names, and a 44 px target. The sparkle is Magic (opens the assistant); the small star is task priority (toggles a flag). Every primary destination has one bottom-nav control; Home does not repeat it.

## Motion and language

One short arrival fade, without blocking interaction. Reduced motion removes decorative transitions. No auto-playing sound, forced splash, photo feed, or repeated onboarding.

“Hey star.” “Where should we go next?” “Before you get there.” Use warmth sparingly; do not promise instant bookings or perfect decisions. Research names its source and checked time. Unverified information stays unverified.
