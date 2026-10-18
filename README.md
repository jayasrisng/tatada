# tatada ✶

A travel companion with trips, tasks, a research notebook, memories, printable trip cards, and an approval-first connection to Wajo Fo. Built for the Wajo AI × Anthropic GSD Hackathon.

Requires Node 22.18+.

## Present locally

For a reliable rehearsal with no real-world actions, use two terminals:

```bash
npm install
npm run server     # mock Fo, durable temporary-provider conversations
npm run dev        # open http://localhost:5173
```

For your personal live presentation, replace `npm run server` with `npm run server:fo`. This binds the backend to localhost and opens one private workspace without a separate sign-in. Authorize Fo once from the profile or Fo chat. Provider authorization stays encrypted on this computer. Never expose single-owner mode publicly.

`TATADA_LIVE_RECIPIENTS` limits the structured email helper. It does **not** restrict general Fo chat. Every live chat message requires explicit authorization of the exact request, plus separate confirmations for detected payments, bookings, cancellations, or messages to others. Fo replies are displayed as its words; they are not automatically verified outcomes.

Presentation flow:

1. Show the canvas, switch themes, and open the Lisbon sample trip.
2. Open its notebook and compare the sample research options.
3. Ask for early check-in from the task shortcut; inspect the exact draft and approve it. In mock mode, demonstrate the result without sending anything real.
4. Open Fo chat to demonstrate preview and confirmation. Use a read-only request for a live presentation unless an actual action is intended.
5. Add a memory, print the trip card, then export your workspace from the profile.

Reset sample data from the profile. Export real work before resetting or importing another workspace.

## Checks

```bash
npm test           # state, portability, OAuth, ownership, actions, chat, hosting
npm run build      # typecheck frontend and server; build production frontend
npm run predemo    # isolated /tatada/ build + separate mock API; smoke and theme checks
```

`predemo` uses temporary mock data and its own ports (15173 and 18787); it leaves existing local servers alone. Browser checks require locally installed Chrome. The rehearsal also verifies preview isolation and disconnect error handling. Screenshots go to ignored `scripts/out/`.

## Website: jayasrisng.com/tatada

GitHub Pages hosts the standalone frontend beneath `/tatada/`. A separate backend is required for live Fo and server workspace sync; the live API is deployed on Supabase Edge Functions with a private Postgres runtime store. GitHub Pages serves the frontend only.

```bash
npm run build:website
```

This builds assets under `/tatada/` and targets `https://utmbjcgttsjvdpghiqkf.supabase.co/functions/v1/tatada-api`. The frontend also accepts `VITE_API_URL` for another HTTPS API origin and `VITE_BASE_PATH` for another subpath. These are public build settings, never secrets.

The portfolio's `scripts/sync-tatada.mjs` copies only the reviewed `dist/` bundle into its `public/tatada/` directory. Its existing Pages deployment preserves that page during future portfolio builds. No `.data/`, credentials, or user workspace is published.

When a hosted API is unavailable, the page explicitly says so and offers a separate sample preview. Preview actions are simulated, cannot use the live action API, and never update real tasks or export the signed-in account's requests. It must not be presented as a working live connection.

The Supabase adapter reuses the action and chat services. A database lease serializes mutations across instances, state is flushed before provider side effects, and bounded background work advances when clients poll. Interrupted sends are reconciled after lease expiry. Work resumes when a client reconnects; this is not an always-running general job scheduler.

Hosted sign-in uses a single-use exchange bound to the initiating browser and a tab-scoped bearer session, so it does not require third-party cookies. Wajo refresh/access tokens remain sealed in Postgres. If Wajo supplies no stable identity, successful OAuth creates a new private connection session instead of pretending to identify a reusable account; the profile asks users to export before signing out.

Supabase source: `supabase/functions/tatada-api/` and `supabase/schemas/tatada.sql`. The function performs its own session authentication (`verify_jwt = false`); only health, OAuth entry/callback, and session setup are public. The database table and RPCs are accessible only to the backend service role. Never copy the service-role key to the browser.

## What is real

- Trip/task editing, canvas positions, memories, QR generation, browser printing, and versioned export/import work.
- Authenticated workspaces sync to the running Tatada server, with account-scoped local caching and recovery copies. Local Node mode stores data in `.data/` and supports one process; hosted mode uses Supabase Postgres.
- The structured email helper has server-authoritative approval hashes, duplicate prevention, restart recovery, and evidence checks. Uncertain sends are never blindly retried. Quotes are not bookings.
- Real Fo chat uses the server's MCP adapter. Unknown response shapes remain working/unverified rather than claiming success.
- Fares, ratings, forecasts, demo confirmations, and notebook sources are sample data. Live travel research is not connected.

## Source map

- `src/screens/`: canvas, trips, planning, notebook, journal, tasks, style, print, onboarding.
- `src/state/`: reducer, storage validation, server client, Fo chat client, portability.
- `src/magic/`: trip-aware drafting, dates, decision evidence, simulated fallback.
- `server/`: HTTP API, OAuth, sessions, action/chat workers, mock/live Fo adapters, tests.
- `docs/fo-integration.md`: provider discovery and live verification limits.
