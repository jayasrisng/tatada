# tatada ✶

An AI-native travel companion: Trips, Tasks, and one Magic button. Built for the Wajo AI × Anthropic GSD Hackathon.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (also on your LAN; open on your phone)
npm run smoke      # with dev server running: clicks through every screen + the Fo flow, saves screenshots to scripts/out/
npm test           # action lifecycle + persistence regression tests
npm run build      # typecheck + production build
```

To reset the demo, tap the avatar on the home screen, then **reset demo data**.

## What's real vs simulated

| | Status |
|---|---|
| UI, navigation, checklist editing, canvas dragging, memory capture, picking options | **Real** (persisted in localStorage) |
| Printing (trip card with QR, journal page) | **Real**, via the browser print dialog |
| Research options, prices, ratings, sources, confirmation codes | **Sample data** (labeled in the UI) |
| Magic replies and Fo actions (approve → progress → question → verified) | **Simulated**, stamped `SIMULATED` on every card. No Fo calls are made. |

## Stack

Vite + React + TypeScript, plain CSS. No UI kit: the chalkboard look is all custom (hand-drawn SVG icons, SVG turbulence filters for chalk texture, Caveat / Patrick Hand / Cabin Sketch fonts bundled locally).

## Map

- `src/screens/`: Home (canvas), Trips, TripWorkspace (Plan · Notebook · Journal), NewTrip, Tasks, Style, PrintView, Welcome
- `src/components/`: Doodle icons, ActionCard (approval → progress → evidence), MagicSheet, Checklist, ui primitives
- `src/magic/engine.ts`: simulated Claude + Fo brain (to be replaced by the backend bridge)
- `src/state/store.tsx`: app state, persistence, and the action runner
- `docs/fo-integration.md`: how the backend will reach Fo, and the open blockers

## Reliability and next steps

Saved browser state is validated before use. Invalid data is backed up under `tatada:v1:recovery`; storage failures show a warning while the app continues in memory. This is local-only persistence, with no account sync or cloud backup.

GitHub Actions runs `npm test` and `npm run build` on pushes and pull requests. See [the repository review](docs/repository-review.md) for prioritized gaps, acceptance checks, and the recommended first live integration.
