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

Style includes a camera/upload button, individual transparent garment images reconstructed from the reference photos, a 2D outfit figure, mix-and-match, itinerary-based suggestions and a packing moodboard. These are visual outfit previews, not accurate body/size or fabric-fit simulations. New uploads remain photo references unless they already have transparency; automatic extraction of new uploads is not connected.

For backend development only, explicitly opt in with `VITE_ENABLE_BACKEND=true npm run dev` plus `npm run server`. `npm run predemo` opts in against an isolated mock backend. Keep this flag off for the browser-only presentation. Existing backend code is retained for later integration; Wajo authorization has not been validated end-to-end and must not be presented as ready.

Presentation flow:

1. Show the canvas, switch themes, and open the Lisbon sample trip.
2. Open its notebook and compare the sample research options.
3. Ask for early check-in from the task shortcut; inspect the simulated draft and clearly label it as a demonstration.
4. Open Style: show the individual clothes, mix an outfit, swipe to keep it, and add its pieces to the packing checklist.
5. Add a memory, print the trip card, then export your workspace from the profile.

Reset sample data from the profile. Export real work before resetting or importing another workspace.

## Checks

```bash
npm test           # state, portability, OAuth, ownership, actions, chat, hosting
npm run build      # typecheck frontend and server; build production frontend
npm run check:browser # browser-only checks against the preview at port 5174
npm run predemo    # isolated /tatada/ build + separate mock API; smoke and theme checks
```

`predemo` uses temporary mock data and its own ports (15173 and 18787); it leaves existing local servers alone. Browser checks require locally installed Chrome. The rehearsal also verifies preview isolation and disconnect error handling. Screenshots go to ignored `scripts/out/`.

## Website: jayasrisng.com/tatada

GitHub Pages hosts the standalone frontend beneath `/tatada/`. A separate backend is required for live Fo and server workspace sync; the live API is deployed on Supabase Edge Functions with a private Postgres runtime store. GitHub Pages serves the frontend only.

```bash
npm run build:website
```

The default build is browser-only and does not call an API. For future backend opt-in, the build command retains the public API address `https://utmbjcgttsjvdpghiqkf.supabase.co/functions/v1/tatada-api`. The frontend also accepts `VITE_API_URL` for another HTTPS API origin and `VITE_BASE_PATH` for another subpath. These are public build settings, never secrets.

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
- `docs/fo-integration.md`: provider discovery and live verification limits.
