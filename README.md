# tatada ✶

A travel companion with trips, tasks, a research notebook, memories, printable trip cards, and an approval-first connection to Wajo Fo. Built for the Wajo AI × Anthropic GSD Hackathon.

Requires Node 22.18+.

## Current continuation — October 19, 2026

Read [the continuation verification report](docs/verification/continuation-2026-10-19.md) and [release preparation / retention / exact owner actions](docs/production-readiness-2026-10-19.md) first. Older sections below retain historical setup and may describe superseded behavior.

Reviewed PDF/text confirmations now join existing travel records, with on-device extraction, duplicate checks and separate encrypted original storage. Explicit offline trip packs include a production service-worker shell, itinerary, reservations, addresses, saved guidance and original tickets; no tokens or passport-vault data. Destination-local next steps use saved IANA zones. Fo replies can become reviewed, editable, reversible local records. Synced trips support reviewed view-only snapshot links with ownership checks, expiry and revocation. Account exports/deletion, nested validation and conflict-choice controls are available.

Run `TATADA_DEV_PORT=5180 npm run dev:offline` for a built local preview with a live backend and explicit offline downloads. Stop the previous launcher on that port first. New server routes require restarting that backend. No public release is implied. Run `npm test`, then a connected `/tatada/` production build and `npm run check:continuation` for the isolated fixture story; see the report for commands and honest counts.

## Run the live local app

```bash
npm install
npm run dev                 # http://127.0.0.1:5173
# If that port is occupied:
TATADA_DEV_PORT=5180 npm run dev
```

Keep `WAJO_FO_ENDPOINT`, `WAJO_FO_API_KEY`, and `CLAUDE_API_KEY` (or `ANTHROPIC_API_KEY`) in the ignored `.env`. The launcher starts a live, localhost-only personal backend and points the frontend at it. It never silently starts mock Fo. Existing servers are not stopped. API keys belong to the one local owner; this mode is refused in public production. `npm run dev:frontend` remains for isolated frontend development, and mock providers remain only for contract tests and explicit rehearsals.

The world map is zoomable, uses bundled Natural Earth vectors, and has no inferred location star. Blackboard is the first-use default; a chosen light theme persists. `#/brand` previews the palette; [brand kit](docs/brand-kit.md) documents colors, lettering, marks and icons. New trips begin with a dream, then only the planning categories the star selects. Today remains independent of trip context.

Magic task controls open live Fo chat. The separate small star toggles priority without contacting a provider. Browser microphone dictation is optional and always produces editable text. “Call Fo” requests a Wajo call link only on a tap; the provider's call page handles microphone permission and audio. No outbound calls, messages or print jobs are started by opening a screen.

Claude research uses the real Messages API with bounded web search, actual citations and checked times. A saved trip briefing is included in workspace exports. Neither research nor Fo receives the document vault automatically. Research can consider worldwide sources and requests beyond coffee or three event sites. No connected airline inventory, mileage account or payment processor is implied by a text recommendation.

Workspace saves and the local server's `.data/` survive reloads. Export/import provides portable backups including journals. Friends can share reviewed read-only itinerary files and keep independent copies; downloaded copies cannot be revoked. Sensitive profile information, bookings, private itinerary notes and documents are excluded from shared trip files.

Private documents live separately in AES-GCM-encrypted IndexedDB, unlocked by a PBKDF2-derived non-extractable key. The key and passphrase are never persisted. Ordinary exports and server workspace sync exclude them. Use a separate encrypted backup; forgetting the passphrase or clearing site data without a backup loses access. Vault fields are manually reviewed and only checked text fields enter a Fo draft after an explicit choice. There is no automatic OCR or document upload to an AI service.

Clothing detection is browser-local visible-garment segmentation, not physical fit simulation. The shared import reviews each photo's metadata/location independently. New map records retain metadata only after confirmation; existing photos and memories are preserved.

Epson PDF preparation and approval remain implemented, but **real Fo attachment delivery is blocked by Wajo's current text-only tool schema**. No print is reported as sent without provider evidence. Multi-user hosted sign-in, Claude configuration on the hosted backend, and the updated public frontend require separate release work. See [architecture and integration boundaries](docs/architecture.md).

## Discover and remember

Tap the central star and type what you want, e.g. “coffee near me with good parking and a nice view”, “a vegetarian restaurant I would actually enjoy”, or “live music this weekend”. Tatada turns the request into editable preferences, then shows a few results with the mapped evidence behind each one. Unknown details stay in “details”. Save any result to the selected trip or to tasks.

- **Places** come from OpenStreetMap through Photon and OSM tags. Ranking uses distance, diet tags, opening hours, a public lot near the venue or the venue's own parking, view evidence, outdoor seating and Wi-Fi. Walking times come from the public OSM foot router after the list appears; if it doesn't answer, straight-line distance is shown and labeled. No ratings source is connected.
- **Events** combine public Luma, Eventbrite and Partiful listings into one deduplicated list. Times use the event's time zone, with distance when the source gives a location, plus price (free / listed price / not listed), reasons and source links. Filters cover today, tomorrow, this weekend, the next 7 days and free only. Expired, canceled, clearly sold-out and online-only listings are excluded. If a source fails or doesn't cover the city, the rest still show, with a one-line explanation.

Events are read by a small key-free service (`server/events/`) because the providers don't allow direct browser requests. `npm run dev` and `npm run preview` mount it at `/events-api`. `npm run events` runs it standalone on port 8790. It is separate from the paused Fo/sign-in server. Static hosting (GitHub Pages) can't run it. `npm run build:website` points the site at the `tatada-events` Supabase function. Until that function is deployed, the panel falls back to provider search links. After deploying, `npm run check:events-remote` verifies health, CORS and source access from Supabase's network.

**One photo import** (Trips → my maps & timeline, or Style → add from photos) reads each photo on the device:
- Embedded date, GPS and IPTC/XMP location labels prefill the place, city and country.
- GPS-only photos can get a city/country suggestion after you agree. Only rounded coordinates go to Photon, never the image or a guessed place name.
- Unknown fields stay blank. A batch can mix places.
- The same photos go through clothing detection, and only pieces you name, categorize and mark “I still own it” join the closet.
- Location and clothing problems are independent and retryable, and duplicates are skipped.

The map view shows the same world map, a concise country → city → place list, and a checkbox list of every country for hand edits. Google Photos account linking is not active. [Feature boundaries](docs/feature-limits.md) describe data, storage and provider limitations.

## Checks

```bash
npm test           # state, portability, discovery ranking/hours, events parsing/dedupe/timezones, OAuth, actions, chat, hosting
npm run build      # typecheck frontend and server; build production frontend
npm run check:browser # browser-only checks against the preview at port 5174
npm run check:features # nearby + events (fixtures); home map, Today context, photo import
node scripts/check-print.mjs # print workflow: MODE=browser | mock | live (see the script header)
npm run predemo    # isolated /tatada/ build + separate mock API; smoke and theme checks
```

`predemo` uses temporary mock data and its own ports (15173 and 18787); it leaves existing local servers alone. Browser checks require locally installed Chrome. The rehearsal also verifies preview isolation and disconnect error handling. Screenshots go to ignored `scripts/out/`.

## Printing to an Epson printer

The print icon on a trip and “print …” requests in Magic open the same workflow:
1. You set up the printer once: its Epson Connect email address and printer-wide settings.
2. Your words become settings: “print in color”, “make it 4×6”, “double-sided”, “two copies”.
3. Tatada makes a clean white PDF and shows that exact PDF with the printer, sender, page count, what each setting really does, and limitations.
4. Nothing is emailed until you approve.

Per Epson's documentation, only grayscale (`=+bk`) and two-sided (`=+dl`) can be requested per email, through the printer address. Paper size, color output and the email-body/sender pages are printer-wide settings. Copies aren't supported, so Tatada offers a disclosed repeat-the-pages PDF or one copy. A 4×6 request becomes a 4×6 card with cut guides on plain paper, and only after you agree.

Approval is tied to the PDF's hash, the printer address, the sender, the settings and the copies. Any edit needs a new approval. Repeated clicks and refreshes send once, uncertain sends are never resent automatically, and “email submitted” is never presented as “printed”.

**Status:** Fo's `ask_fo` accepts text only and doesn't expose a sending account, so live Fo delivery reports that blocker. Development uses a mock sender. Without the backend, the app offers PDF preview, download and browser printing, and no printer address is saved. See `docs/fo-integration.md`.

To try the full flow locally with the mock sender:

```bash
TATADA_SINGLE_OWNER=1 APP_URL=http://localhost:5182 npm run server     # mock Fo, localhost only
VITE_ENABLE_BACKEND=true VITE_API_URL= npx vite --host localhost --port 5182
```

`npm run server:fo` (single-owner, live) loads `WAJO_FO_ENDPOINT` and `WAJO_FO_API_KEY` from `.env`. The key is used only as that local owner's Fo credential and is never sent to the browser.

## Website: jayasrisng.com/tatada

GitHub Pages hosts the standalone frontend beneath `/tatada/`. A separate backend is required for live Fo and server workspace sync; the live API is deployed on Supabase Edge Functions with a private Postgres runtime store. GitHub Pages serves the frontend only.

```bash
npm run build:website
```

The default build keeps workspace saves in the browser and does not call Tatada’s paused backend. User-triggered discovery uses public map and routing APIs; clothing detection downloads model files for local inference. For future backend opt-in, the build command retains the public API address `https://utmbjcgttsjvdpghiqkf.supabase.co/functions/v1/tatada-api`. The frontend also accepts `VITE_API_URL` for another HTTPS API origin and `VITE_BASE_PATH` for another subpath. These are public build settings, never secrets.

The portfolio's `scripts/sync-tatada.mjs` copies only the reviewed `dist/` bundle into its `public/tatada/` directory. Its existing Pages deployment preserves that page during future portfolio builds. No `.data/`, credentials, or user workspace is published.

## Optional backend (paused)

The following describes retained backend code, available only with `VITE_ENABLE_BACKEND=true`. Wajo sign-in is not currently offered in the default app.

When a hosted API is unavailable, the page explicitly says so and offers a separate sample preview. Preview actions are simulated, cannot use the live action API, and never update real tasks or export the signed-in account's requests. It must not be presented as a working live connection.

The Supabase adapter reuses the action and chat services. A database lease serializes mutations across instances, state is flushed before provider side effects, and bounded background work advances when clients poll. Interrupted sends are reconciled after lease expiry. Work resumes when a client reconnects; this is not an always-running general job scheduler.

Hosted sign-in uses a single-use exchange bound to the initiating browser and a tab-scoped bearer session, so it does not require third-party cookies. Wajo refresh/access tokens remain sealed in Postgres. If Wajo supplies no stable identity, successful OAuth creates a new private connection session instead of pretending to identify a reusable account; the profile asks users to export before signing out.

Supabase source: `supabase/functions/tatada-api/` and `supabase/schemas/tatada.sql`. The function performs its own session authentication (`verify_jwt = false`); only health, OAuth entry/callback, and session setup are public. The database table and RPCs are accessible only to the backend service role. Never copy the service-role key to the browser.

## What is real

- Trip/task editing, canvas positions, memories, QR generation, browser printing, and versioned export/import work.
- With backend opt-in, authenticated workspaces sync to the running Tatada server, with account-scoped local caching and recovery copies. Local Node mode stores data in `.data/` and supports one process; hosted mode uses Supabase Postgres.
- The structured email helper has server-authoritative approval hashes, duplicate prevention, restart recovery, and evidence checks. Uncertain sends are never blindly retried. Quotes are not bookings.
- The paused Fo chat implementation uses the server's MCP adapter. Unknown response shapes remain working/unverified rather than claiming success.
- Fares, ratings, forecasts, demo confirmations, and notebook sources are sample data. Live travel research is not connected.

## Source map

- `src/screens/`: canvas, trips, planning, notebook, journal, tasks, style, print, onboarding.
- `src/state/`: reducer, storage validation, server client, Fo chat client, portability.
- `src/magic/`: trip-aware drafting, dates, decision evidence, simulated fallback.
- `server/`: HTTP API, OAuth, sessions, action/chat workers, mock/live Fo adapters, tests.
- `server/events/`: key-free public event search (Luma, Eventbrite, Partiful), separate from the Fo API.
- `src/discovery/`: request parsing, place ranking, opening hours, event display.
- `src/travel/`: countries, visited/planned, the shared photo importer.
- `src/print/` + `server/print.ts`: print plans (Epson rules), PDFs, approval-bound print jobs.
- `docs/fo-integration.md`: provider discovery and live verification limits.
