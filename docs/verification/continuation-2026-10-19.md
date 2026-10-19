# Tatada continuation verification — October 19, 2026

Updated preview: http://127.0.0.1:5180/#/trips. The identified live local launcher was refreshed after checking that no action, Fo request or print job was active. Its existing saved workspace passed the new validator before and after the refresh. No existing workspace, unrelated modification or historical demo evidence was reset. The preview serves a production shell so explicit offline downloads work.

## What works end to end

| Story | Evidence and boundary |
|---|---|
| Readable PDF / pasted text → reviewed reservation | Isolated browser uploads a generated flight confirmation, checks extracted values before any record exists, saves it through the existing reducer and versioned API, imports a hotel confirmation, rejects a repeated PDF, reloads the saved records. No airline/provider booking request occurs. |
| Original storage → retrieval | Device-key AES-GCM IndexedDB original; exact imported PDF bytes match downloads both online and offline. Separate source download/deletion controls, with a profile inventory for retained originals after removing a reservation. The passport/visa vault remains outside workspace sync and offline packs. |
| Explicit trip download → offline restart | Static production shell under `/tatada/` plus selected trip essentials. Five fixture runs shut down the **entire Chrome process**, restart from a temporary persistent profile, disable network before navigation, then retrieve itinerary, booking references and original PDF bytes. Earlier runs covered a closed-page restart. |
| Next relevant step | Pure tests cover explicit departure/arrival zones, overnight flights, missing zones, DST repeated/skipped wall times, hotel check-in, completed activities and reversible stage completion. Browser check opens and focuses the specific reservation from the next-step card. No live-status claim is inferred from a saved schedule. |
| Fo advice → editable local record → undo | Fixture Fo reply is reviewed, edited into a task, applied, reloaded and undone. Pure tests cover tasks/stops/journal proposals, current-trip/date validation, persistent idempotency, repeat application/undo and protection for later edits. Conversation history is retained. |
| Reviewed sharing → view → revoke | Actual local backend stores an allowlisted reviewed snapshot, hashes the capability token, checks owner/expiry/revocation, serves a view-only page and rejects a revoked link after refresh. Private booking codes and itinerary notes are absent from the friend view. Tests also cover wrong-owner and expired links. |
| Offline/pending edits → reconnection/conflict | Browser disables networking in the editable workspace, saves an edit, sees the pending-sync message, reconnects and observes the server record. A deliberately advanced remote version triggers an explicit conflict choice while local data stays visible. Keeping local saves against the reviewed remote version. A failed initial workspace load recovers from the cached copy and retries successfully. Delayed save responses are guarded against account changes. |
| Account lifecycle | Backend fixtures verify confirmed, scoped export/deletion, omitted credentials, invalidated sessions, isolation from other accounts and refusal to erase an active uncertain request. Device controls pause sync before deletion, clear this workspace's originals/downloads/cache and offer removal of its separate vault. Production backup erasure remains an owner-controlled dependency. |
| Local/hosted preparation | Shared nested workspace contract, routes and optional research/Gmail/travel composition. Hosted Gmail tests exercise prepare → unauthenticated callback staging → authenticated same-tab/account completion without a callback cookie. No production deployment was made. |

## Results and honest counts

- Baseline before implementation: production build passed; 83 application tests passed. The sandbox blocked listening ports for 17 server tests. Once run with local-server access, the existing **83 + 117 = 200** tests passed.
- Final regression suite: **90 application + 124 server = 214 passed**, 0 failed.
- Final production build, frontend/server type checks and `git diff --check`: passed. Existing >500 kB bundle warnings remain, notably voice/PDF-related chunks. These are not a passing performance audit.
- New automated browser fixture runs: **9 started, 8 passed, 1 failed**. Seven connected-app runs passed. The first browser-only parity runner timed out trying to click a reconnect button after automatic recovery had already removed it; its failed result is retained. A separately identified corrected rerun passed. Do not count that failed run as an uninterrupted success.
- New recorded localhost diagnostic run: **1 passed** (seven read-only HTTP checks). Earlier ad-hoc read-only health/configuration checks were also used; they were not complete demo attempts or provider requests.
- **New complete live-provider demo attempts: 0. New provider calls / real external communications in these runs: 0.** No live purchase, booking, check-in, print email or voice call was executed.
- Historical live demo totals remain **2 attempts / 1 eventual completion with runner recovery / 0 uninterrupted successes**. See the unchanged [historical report](live-demo-2026-10-19.md) and [historical trace](run-trace-2026-10-19.txt). Diagnostic research requests and earlier unscoped Fo calls remain excluded from those totals.

Success criteria were written in [build-plan-2026-10-19.md](build-plan-2026-10-19.md) before new fixture runs. Criteria were strengthened to include a browser-process restart, standalone browser-only recovery, warm offline pending edits and initial-load recovery; the append-only ledger preserves each earlier run's own criteria.

## Evidence and repeatability

- [Append-only continuation ledger](continuation-runs.jsonl): actual scripted browser call boundaries, results, failures and separately categorized HTTP diagnostic calls. These are runner/browser operations, not fabricated Fo tool executions. No new Fo agent tool calls took place. Existing live provider tool evidence was preserved separately.
- Latest complete connected fixture result: `scripts/out/continuation/fixture-2026-10-19T14-55-00.511Z/result.json`.
- Its screenshots: `scripts/out/continuation/fixture-2026-10-19T14-55-00.511Z/{trip-import,offline-cold-launch,reviewed-trip}.png`.
- Corrected browser-only screenshot: `scripts/out/continuation/browseronly/reconnected.png`.
- Raw artifacts remain ignored local files. Only synthetic trips and redacted event metadata enter the tracked ledger. Earlier private `.data/e2e-backups/` and live-demo run ledger were not rewritten.

```sh
npm test
VITE_ENABLE_BACKEND=true VITE_API_URL= VITE_BASE_PATH=/tatada/ npm run build -- --outDir /tmp/tatada-fixture-dist
TATADA_FIXTURE_DIST=/tmp/tatada-fixture-dist node scripts/check-continuation.mjs
VITE_ENABLE_BACKEND=false VITE_API_URL= VITE_BASE_PATH=/ npm run build -- --outDir /tmp/tatada-browseronly-dist
node scripts/check-offline-browseronly.mjs
# Read-only diagnostics against the current real local preview; no provider I/O:
node scripts/check-preview-readonly.mjs
```

Fixtures use separate ephemeral ports/profiles and an in-memory mock API; they never write `.data/` or contact live travel, printing or messaging providers. The production preview's read-only diagnostic checks do inspect the actual workspace contract but record only validity/configuration booleans and HTTP statuses.

## Limits, mocks and owner-dependent verification

- Import supports **one reviewed flight, hotel or transport record per import**, using labeled readable text, ISO dates and 24-hour times. PDF limit: 8 MB / 30 pages; extracted text limit: 150,000 characters. Scans, encrypted/unreadable PDFs, unlabeled free-form confirmations, multi-record automation and OCR are not certified. Unknown/ambiguous fields stay blank for manual review. No real private traveler's documents were used in these tests.
- Originals live on the device, encrypted with a browser device key, and are deliberately excluded from server exports. This is not a passphrase lock or cloud backup. Other devices need their own originals. Lost browser data/keys can lose originals; download backups first.
- Cold-launch offline packs are **read-only snapshots**. Warm workspace edits are kept locally and sync after reconnection. Download updates are explicit; changes made afterward do not silently refresh the pack. Directions, live provider status, new research and Fo require internet. Mobile OS eviction, installation, full phone restart and airplane mode on actual iOS/Android still need human checks.
- Fo updates save advice as local records after review. No automatic reservation/check-in/payment capability was added. “Stop waiting” stops local polling; Wajo's exposed contract does not provide guaranteed remote cancellation. Fo may continue remotely, and the UI says so.
- Read-only Amadeus status/inventory adapters use fixture provider responses in tests. The preview reports provider configuration missing. There is no live status/inventory validation, shopping UI for offers, booking/payment/check-in/loyalty integration or guarantee of coverage. Later update: profile weather now follows permission-based device location while mounted, refreshing on movement and every 15 minutes; no fallback city is invented. Existing sample fares, demo booking codes, wardrobe/forecast fixtures and presentation trips remain labeled or documented sample data; they were not converted into real reservations.
- Later update: Gmail registration and real Google consent are complete, and the local preview reports a verified connected sender. Epson sender approval, email delivery and physical output remain unverified. Human Fo microphone/audio/interruptions/reconnection on a phone remain unverified.
- Sharing works locally; loopback links are not public friend links. Deployment, actual hosted identity, real two-device synchronization, hosted optional services and public revocation/deletion need staging verification with owner access. There is no SQL migration for the additive runtime JSON fields.
- Backup retention duration and erasure from external/provider histories are not verified. Do not claim complete removal from all backups. See [production readiness / exact owner actions / retention and rollback](../production-readiness-2026-10-19.md).
- Five-traveler recruitment and actual feedback remain with the owner. [The short traveler test](../traveler-test-2026-10-19.md) is ready; no feedback was invented.
