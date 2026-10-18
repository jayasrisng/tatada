# tatada ✶

A travel companion with trips, tasks, a research notebook, memories, printable trip cards, and an approval-first connection to Wajo Fo. Built for the Wajo AI × Anthropic GSD Hackathon.

Requires Node 22.18+.

## Present locally

Sign-in and Wajo Fo are paused. The default app runs without a backend:

```bash
npm install
npm run dev        # open http://localhost:5173
```

Trips, closet photos, kept outfits and itinerary edits save in localStorage in this browser. They do not sync across browsers/devices. Use **profile → export/import** for backups; clearing site data removes local saves. Seeded trips are samples, and Magic actions are simulated.

Style includes a camera/upload button, individual transparent garment images reconstructed from the reference photos, a 2D outfit figure, mix-and-match, itinerary-based suggestions and a packing moodboard. These are visual outfit previews, not accurate body/size or fabric-fit simulations. New outfit uploads are automatically segmented into visible individual pieces by a browser-local detector, then reviewed before adding to the closet. Detection can miss edges or merge layers; it does not reconstruct hidden fabric.

For backend development only, explicitly opt in with `VITE_ENABLE_BACKEND=true npm run dev` plus `npm run server`. `npm run predemo` opts in against an isolated mock backend. Keep this flag off for the browser-only presentation. Existing backend code is retained for later integration; Wajo authorization has not been validated end-to-end and must not be presented as ready.

Presentation flow:

1. Show the canvas, switch themes, and open the Lisbon sample trip.
2. Open its notebook and compare the sample research options.
3. Ask for early check-in from the task shortcut; inspect the simulated draft and clearly label it as a demonstration.
4. Open Style: show the individual clothes, mix an outfit, swipe to keep it, and add its pieces to the packing checklist.
5. Add a memory, print the trip card, then export your workspace from the profile.

Reset sample data from the profile. Export real work before resetting or importing another workspace.

## Discover and remember

Tap the central star and type what you want, e.g. “coffee near me with good parking and a nice view”, “a vegetarian restaurant I would actually enjoy”, or “live music this weekend”. Tatada turns the request into editable preferences, then shows a few results with the mapped evidence behind each one. Unknown details stay in “details”. Save any result to the selected trip or to tasks.

- **Places** come from OpenStreetMap through Photon and OSM tags. Ranking uses distance, diet tags, opening hours, a public lot near the venue or the venue's own parking, view evidence, outdoor seating and Wi-Fi. Walking times come from the public OSM foot router after the list appears; if it doesn't answer, straight-line distance is shown and labeled. No ratings source is connected.
- **Events** combine public Luma, Eventbrite and Partiful listings into one deduplicated list. Times use the event's time zone, with distance when the source gives a location, plus price (free / listed price / not listed), reasons and source links. Filters cover today, tomorrow, this weekend, the next 7 days and free only. Expired, canceled, clearly sold-out and online-only listings are excluded. If a source fails or doesn't cover the city, the rest still show, with a one-line explanation.

Events are read by a small key-free service (`server/events/`) because the providers don't allow direct browser requests. `npm run dev` and `npm run preview` mount it at `/events-api`. `npm run events` runs it standalone on port 8790. It is separate from the paused Fo/sign-in server. Static hosting (GitHub Pages) has no events service, so the panel falls back to provider search links until `supabase/functions/tatada-events` is deployed and the site is built with `VITE_EVENTS_URL`.

In **Trips → my map & timeline**, import selected local photos, review dates and city/country labels, then add them to your history. Available GPS creates map points, photos appear in trip journals, and **find clothes** sends a photo to the closet detector. Google Photos account linking is not active. Exported/original files can be selected manually. [Feature boundaries](docs/feature-limits.md) describe data, storage and provider limitations.

## Checks

```bash
npm test           # state, portability, discovery ranking/hours, events parsing/dedupe/timezones, OAuth, actions, chat, hosting
npm run build      # typecheck frontend and server; build production frontend
npm run check:browser # browser-only checks against the preview at port 5174
node scripts/check-discovery-history.mjs # nearby + events flow (fixtures), photo-history browser checks
npm run predemo    # isolated /tatada/ build + separate mock API; smoke and theme checks
```

`predemo` uses temporary mock data and its own ports (15173 and 18787); it leaves existing local servers alone. Browser checks require locally installed Chrome. The rehearsal also verifies preview isolation and disconnect error handling. Screenshots go to ignored `scripts/out/`.

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
- `docs/fo-integration.md`: provider discovery and live verification limits.
