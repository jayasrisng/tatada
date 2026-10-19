# Backend review · 18 October 2026

Assessment: a thoughtful prototype with useful action-safety machinery, suitable for a controlled local presentation. It is not yet a complete production travel platform. This is a source-code review and local functional verification, not an independent penetration test or cloud-configuration audit.

## What is already designed well

- Clear provider boundaries: app routes, Fo transport, action/chat services, printing, research and public events are separate modules.
- Account ownership checks, HttpOnly session cookies, origin checks, payload limits, local-only API-key owner mode, and sealed provider credentials. See server/app.ts, oauth.ts, crypto.ts and index.ts.
- Prepared-message hashes, idempotency keys, saved sending state and reconciliation of uncertain sends. Fo text is not silently counted as proof of a completed booking. See server/actions.ts, chat.ts and print.ts.
- Browser documents use a separate encrypted IndexedDB vault and are excluded from regular workspace sync/exports. Explicit field selection controls sharing.
- Existing hosted adapter uses a private service-role repository with a database lease, saved-state flush before Fo side effects, and abandoned-worker recovery. The SQL denies direct anon/authenticated access to the runtime row. See server/edge.ts, supabase.ts and supabase/schemas/tatada.sql.

## Highest-priority launch gaps

1. **Hosted/local feature parity.** server/index.ts composes IntelligenceService, but server/edge.ts does not. Local Claude features are not thereby deployed. Configure one production runtime, managed secrets, account auth and a repeatable deployment check before sharing a public app.
2. **Storage and concurrency.** Local Store writes one JSON file atomically, but there is no lock coordinating multiple local processes. Hosted storage uses one runtime JSONB row and a global lease for all users. That serializes unrelated writes and makes the whole account collection a shared operational unit. Move trips, tasks, actions and jobs to account-owned records with transactional constraints and tested authorization; keep private data and provider credentials separately controlled. Preserve migrations and backup/restore verification.
3. **Durable autonomous work.** The local worker is a 500 ms timer. Hosted work advances bounded jobs after requests/polls. This is not a scheduled durable job system that guarantees progress with every client closed. Add leased jobs, a scheduled worker, bounded retries and visible failed-job recovery.
4. **Usage and cost controls.** API/research/event limits are currently instance-local. They are not account-wide limits across replicas. Add a shared budget for provider calls, voice sessions, searches and storage, plus per-account quotas and spend alerts.
5. **Explicit action capabilities.** Chat currently classifies risks with regular expressions. Exact-message approvals are valuable but keyword detection cannot prove that natural-language agent requests are read-only. Production actions need typed tool permissions, concrete execution limits and approval tied to the actual purchase/message/booking details. An assistant key does not itself establish inventory access or a transaction capability.
6. **Workspace validation.** The workspace PUT route checks the top-level shape and version but does not deeply validate every nested trip/task/document reference. Enforce a versioned schema at the API boundary and record-level constraints, rather than trusting browser validation alone.
7. **Operational visibility.** Add structured request/job IDs, redacted provider diagnostics, health checks that distinguish auth from capability, error reporting, reliable backups and recovery drills. A long-running request should have a resumable job status and cancellation rather than a vague timeout.

## Biggest missing product capabilities

- Real inventory/booking and loyalty/discount verification for flights, stays, cars and insurance; wallet/payment-provider integration and reconciliation. Claude research and Fo conversation are not substitutes for these contracts.
- Verified end-to-end printer delivery. Gmail PDF transport and OAuth are implemented locally, but a Google OAuth client must be configured and the user must authorize it. No real print email or physical print has been verified. Fo itself still cannot accept PDF attachments.
- Browser microphone/audio rehearsal, mobile-browser permissions, reconnect behaviour, and a hosted multi-user sign-in test on a second device.
- Offline itinerary/essentials, robust timezone handling for multi-stop trips, destination changes and cancellations, and essential information available when connectivity drops.
- Hosted trip-sharing links with revocation and permissions if collaboration is a product goal. Existing files are read-only snapshots.
- Evidence quality: fresh official emergency/entry/closure information, visible checked times, conflicts and unknowns. Citations support research; they do not guarantee correctness or a completed external action.
- Closet AI currently receives clothing metadata, not a laundry/wear-history tracker or a guaranteed structured outfit validator. Validate generated garment IDs if suggestions are later turned into saved outfits automatically.

## For tomorrow’s presentation

Use the local live preview. Confirm both prepared briefings remain visible, rehearse one user-triggered Fo audio session, test Today styling, and avoid promising unsupported purchases or printer delivery. Presentation itinerary/journal records are sample content; provider connection and research responses are real. The account has a private rollback backup before population.
