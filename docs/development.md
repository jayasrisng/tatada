# Development and repository map

## Folder ownership

| Folder | Purpose |
| --- | --- |
| `src/screens/` | Route-level screens |
| `src/components/account/` | Login, security, profile and beta controls |
| `src/components/assistant/` | Magic, Fo, research and action UI |
| `src/components/travel/` | Trip plans, confirmations, packing, documents and sharing UI |
| `src/components/discovery/` | Maps, nearby discovery and weather |
| `src/components/journal/` | Photos, originals and memories |
| `src/components/printing/` | PDF/print configuration UI |
| `src/components/integrations/` | Google connection UI |
| `src/components/layout/` | Shared visual primitives and navigation |
| `src/assistant/`, `src/travel/`, `src/print/`, etc. | Domain logic; keep separate from presentation |
| `src/state/` | Browser state, persistence, identity and synchronization |
| `server/` | API, provider adapters and hosted state handling |
| `shared/` | Contracts shared by browser and server |
| `supabase/` | Schema, migrations and hosted entry points |
| `tests/`, `server/tests/`, `e2e/` | Domain, API/database and browser tests |
| `scripts/` | Reproducible development and release commands |
| `public/` | Only assets deliberately shipped to every build |
| `assets/screenshots/` | Documentation screenshots |
| `docs/` | Maintained product, development and beta documentation |
| `.local/archive/` | Superseded reports, reviews and historical evidence; private |
| `.local/creative/` | Private video exports and original outfit photography |
| `.local/launch-film/` | Existing editable film project; retained in place |
| `.local/beta-release/`, `.local/planner-release/`, `.local/beta-hosting/` | Existing release evidence/checkouts; retained at original paths |
| `.data/`, `.local/v01-auth/` | Private runtime data; not cleanup targets |
| `dist/`, `test-results/`, `playwright-report/` | Generated output; ignored |

Keep imports direct and preserve lazy-loaded feature boundaries. Put a component in the feature that owns it; share only actual reusable primitives. Avoid a barrel file that imports every feature.

## Development modes

Use Node 22.22+; CI currently pins 24.19.0. Install locked dependencies with `npm ci`.

- `npm run dev:frontend`: browser-only sample, no provider credentials required.
- `npm run dev`: connected local development with hot reload. Copy `.env.example` to `.env` and configure private credentials. The launcher requires `WAJO_FO_API_KEY` unless `TATADA_WAJO_LOGIN=1` is selected. Research additionally requires `CLAUDE_API_KEY` or `ANTHROPIC_API_KEY`.
- `TATADA_DEV_PORT=5180 npm run dev:offline`: production-built connected local preview for offline checks; it has the same credential requirements as `dev`.
- `npm run build:website`: frontend build for the existing hosted API and `/tatada/` base path. This does not deploy anything.

Do not run two connected launchers against the same private state store. Never put backend secrets in `VITE_` variables.

## Wajo-first development candidate

```sh
TATADA_WAJO_LOGIN=1 TATADA_AUTH_MODE=wajo TATADA_PRINT_DELIVERY=wajo TATADA_DATA_DIR=.local/wajo-first-candidate/runtime TATADA_DEV_PORT=5197 npm run dev
```

This uses per-user Wajo OAuth and the dedicated approved-PDF adapter. It does not use the local owner's API key for visitors. On the hosted Edge runtime the same auth/delivery flags select the candidate; defaults retain the existing Supabase beta and disabled delivery. Do not switch the current deployment until returning users and existing workspace ownership have been verified. Wajo-only mode does not provide the Supabase owner/invitation/feedback controls.

Hosted PDF requests use a signed, approved-job-only URL expiring after 30 minutes. Localhost may inline PDFs up to 64 KB; larger local PDFs require the hosted candidate or download. Fo needs a non-empty email body. Printer-side body printing and approved senders are Epson settings, not something Tatada changes automatically. Wajo status remains unconfirmed even when Fo reports success; restarting or polling never repeats a request.

## Validation

Run `npm run typecheck`, `npm run build`, `npm test`, and `npm run test:e2e`. Install Chromium once with `npx playwright install chromium`. Browser tests start isolated local servers and need permission to bind ports.

CI additionally builds the website target, audits dependencies and runs `scripts/real-auth-smoke.mjs` against a disposable Supabase stack. Sample UI and controlled fixtures do not prove production health or real-device behavior.

The hosted adapter persists a shared runtime snapshot with a serialized write lease. Conflicts return 409; exhausted lease acquisition returns 503. This warrants realistic concurrent-use testing before increasing the cohort. Local JSON persistence is intended for a single local process.

## Keep the repository clean

Update the three existing docs rather than adding `FINAL`, `SUMMARY`, `READY`, or duplicate report files. Put raw run output in ignored `test-results/`; keep only concise acceptance status in the beta guide. Preserve sensitive release evidence privately and distinguish historical results from fresh verification.

`public/` is copied into the build: it is not a storage folder for original photos or marketing videos. Keep source media under `.local/creative/`; publish only explicitly selected assets.

The October 22 cleanup archived older prototype instructions and the old README, grouped 71 components, and relocated unreferenced videos and original outfit photos. `.local/archive/cleanup-moves.json` records private artifact moves. Historical scripts may refer to their original paths; archived experiments are not supported launch commands. Runtime stores, release checkouts, backup keys and editable film sources were preserved.
