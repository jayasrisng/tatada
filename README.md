# tatada ✶

An AI-native travel companion: Trips, Tasks, and one Magic button. Built for the Wajo AI × Anthropic GSD Hackathon.

## Run it

Needs Node 22.18+ (the server runs TypeScript directly).

```bash
npm install
npm run server     # Tatada server on :8787 with mock Fo (no real emails)
npm run dev        # http://localhost:5173, proxies /api to the server
npm test           # app state, trip-aware Magic, and server (OAuth, actions, HTTP) tests
npm run smoke      # with both running: browser assertions + screenshots in scripts/out/
npm run build      # typecheck app + server, production build
```

Without `npm run server`, the app still works and Magic falls back to a labeled in-browser simulation.

### Live Fo

```bash
TATADA_LIVE_RECIPIENTS=you@example.com TATADA_SECRET=<32+ random chars> npm run server:live
```

Then open your profile (the avatar) and choose **connect Fo**. Tatada registers itself with Wajo's OAuth server, you approve on Wajo, and the token stays sealed in `.data/` on the server. Live sends only go to addresses in `TATADA_LIVE_RECIPIENTS`.

To reset the demo, tap the avatar on the home screen, then **reset demo data**.

## What's real vs simulated

| | Status |
|---|---|
| UI, navigation, checklist editing, canvas dragging, memory capture, picking options | **Real** (persisted in localStorage) |
| Printing (trip card with QR, journal page) | **Real**, via the browser print dialog |
| Research options, prices, ratings, sources, confirmation codes | **Sample data** (labeled in the UI) |
| Early check-in / late arrival emails | Built from the selected trip and profile. Missing details are asked for. Approval, execution, and verification run **on the Tatada server**: `MOCK FO` by default, `REAL · via Fo` in live mode |
| Restaurant call, hotel reply, sample forecast | **Lisbon demo fixtures only**, labeled |
| Other Magic requests without the server | **Simulated** in the browser, stamped `SIMULATED` |

## Stack

Vite + React + TypeScript, plain CSS. No UI kit: the chalkboard look is all custom (hand-drawn SVG icons, SVG turbulence filters for chalk texture, Caveat / Patrick Hand / Cabin Sketch fonts bundled locally).

## Map

- `src/screens/`: Home (canvas), Trips, TripWorkspace (Plan · Notebook · Journal), NewTrip, Tasks, Style, PrintView, Welcome
- `src/components/`: Doodle icons, ActionCard (approval → progress → evidence), MagicSheet, Checklist, ui primitives
- `src/magic/`: trip-aware request drafting (`stay.ts`), date helpers, and the simulated fallback brain
- `src/state/`: browser state and persistence (`store.tsx`, `reducer.ts`), server client (`server.tsx`)
- `server/`: Fo OAuth client, MCP client, Fo adapters (live + mock), action service, HTTP API, tests
- `docs/fo-integration.md`: Fo discovery evidence, the implemented bridge, and the remaining live step

## Reliability and next steps

Saved browser state is validated before use. Invalid data is backed up under `tatada:v1:recovery`; storage failures show a warning while the app continues in memory. This is local-only persistence, with no account sync or cloud backup.

GitHub Actions runs `npm test` and `npm run build` on pushes and pull requests. See [the repository review](docs/repository-review.md) for prioritized gaps, acceptance checks, and the recommended first live integration.
