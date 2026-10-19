# Tatada: repository guide

## Product surfaces

- `src/screens`: route-level pages; Home, trip creation, planning, Style, profile, printing. The brand reference stays in docs.
- `src/components`: reusable UI and feature panels. Heavy imports (photo detection, private documents, printing) load on demand.
- `src/styles/global.css`: existing board layouts; `brand.css`: final role tokens and visual treatment.
- `src/state`: workspace state, validation, persistence, backups, account sync, routing and server clients.
- `src/types.ts`: portable workspace schema. Backward-compatible optional profile fields preserve old exports.

## Features

- `src/travel`: countries, photo metadata, per-photo import and travel statistics. Images used for local clothing extraction are never sent by geocoding.
- `src/style`: local segmentation and outfit suggestions. Outfit previews are not physical fit simulation.
- `src/discovery`: map-based places, routes and public events. Research handles broader requests with source-linked web search.
- `src/privacy`: encrypted IndexedDB document vault. Intentionally outside AppState, sync and normal exports.
- `src/sharing`: explicit-allowlist trip snapshots. No booking references or document vault contents.
- `src/print`: PDF formatting, settings interpretation and approval client.
- `src/magic`: retained development fixtures and narrow drafting rules. Live task shortcuts go to Fo; production failures do not silently invoke the simulated helper.

## Backend

- `server/index.ts`: local runtime composition. `scripts/dev.mjs` starts an isolated live loopback backend plus the frontend, with .env secrets only on the backend.
- `server/app.ts`: authenticated routes, origin checks, bounded request bodies and action APIs.
- `server/fo.ts`, `apikey.ts`, `oauth.ts`, `mcp.ts`: provider transport and credentials. An owner API key is restricted to a localhost-only owner server. Multi-user hosted accounts use their own authorization.
- `server/intelligence.ts`: Claude model discovery and bounded web research; citations are taken from actual provider citation blocks. No tool execution, hidden document sharing, or purchase capability.
- `server/gmail.ts`: independent send-only Gmail authorization, encrypted refresh credentials and Epson-only MIME PDF delivery. Local runtime wiring; Google app registration and user consent are required.
- `server/actions.ts`, `chat.ts`, `print.ts`: durable approvals, uncertain-send handling and evidence checks.
- `server/events`: independent no-key public event readers with bounded fetching.
- `server/edge.ts`, `supabase`: retained hosted adapters. New local research must be configured separately before claiming hosted readiness.

## Verification and assets

- `tests`: pure workspace, import, outfit, sharing and vault regression tests.
- `server/tests`: backend ownership, actions, provider contracts and research behavior.
- `scripts`: build, rehearsal, browser and hosted checks. These are operational tools, not stale product pages.
- `public/areas`: attributed offline vector extracts for the two default upcoming destinations; rendered by AreaMap without remote tiles.
- `public/brand`: portable SVG star marks. `public/wardrobe`: existing reconstructed garments; do not remove as “unused” because image references are data-driven.

## Cleanup decisions

The old map tile styling and unused Home shortcut rules were removed. Map component and brand tokens now own map appearance. Removed unused decorative font imports/dependencies only where no remaining component uses them. No migrations, personal uploads, ignored .env files, or saved workspaces were removed. Mock provider and drafting fixtures remain for existing contract tests and explicit development use; they are not a live-provider fallback.

## Known integration boundaries

Fo authenticated tool discovery succeeds with the configured key. Its current ask_fo schema exposes message/conversation fields, without a PDF attachment input. Printing therefore uses separately authorized Gmail. The saved preferred sender is an OAuth account-selection hint; it cannot forge a From identity. Preparation and approval block mismatches with the verified Gmail account.

Calls now stay in Tatada. After an explicit call tap, the backend gets structuredContent.joinUrl and redeems its one-use ticket at Wajo's published MCP call join endpoint. Only a short-lived participant credential and allowlisted secure LiveKit endpoint reach the browser; API keys remain server-side and call credentials are not persisted. The lazily loaded LiveKit client handles audio, presence, mute, disconnect and microphone denial. No provider scripts are inserted into the app origin, and no blocked hosted page is framed. Closing/unmounting cancels connection and stops tracks. Live signaling was verified without publishing microphone audio; human two-way audio still requires browser permission and an actual user call.

Membership labels support research, not authenticated mileage access. No airline, insurance, or payment partner has been connected by adding a Claude key. Document fields must be manually reviewed and explicitly selected before sharing with Fo. Full OCR and remote hosted synchronization of local documents are not implemented.
