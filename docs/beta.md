# Private beta: readiness and operations

Source review: October 22, 2026. Candidate version: **0.1.0-beta.1**. Scope: one owner plus ten testers, on the existing website and Supabase project.

## Five-step setup — October 22

Essential onboarding is Wajo → printer → first trip → Trip Mode → My World. Connection state, persisted printer settings, saved trips and actual Trip Mode state drive progression. The guide resumes across Wajo authorization using a workspace-scoped session marker containing only its step number. The marker is cleared on exit or completion. Photos, wardrobe, voice, vault and data sharing are separate optional lessons; photo and sharing lessons guide a traveler without a trip through creating one first. Every step can be skipped.

## Profile and hands-on guide refinement — October 22

Your Space shows compact Wajo and printer controls, four printing-default selects, Preferences, Vault, and data export/import. Policies, printer tips and sources are footer links; account/device panels are removed from this view. The guide advances on saved work and keeps uploads and external authorizations in the user’s hands. It handles native-dialog layering and moves the vault highlight to Save after file selection. Empty text fields have placeholders, with specific examples where available.

## Device-first correction — October 22

The owner requires direct app entry with no Tatada invitation or signup. The website build now enables a device-local workspace that remains stable across connecting, disconnecting and expiry of Wajo. Profile stores the printer locally before connecting. Backend access is an optional Wajo connection; credentials stay sealed server-side. Preparing a PDF shares its destination/settings with the backend, and delivery still needs explicit approval. Existing cloud workspace rows are retained separately; there is no automatic migration into the device workspace. Legacy invitation deployment instructions below are historical.

## Wajo-first candidate — October 22

The new candidate supports **connect Wajo → save printer email → preview a PDF → Send with Wajo**, without a separate Tatada password when configured in Wajo account mode. Existing hosted beta behavior is unchanged until a reviewed deployment switches modes.

A dedicated Wajo printing adapter hands off only an explicitly approved document and destination. It preserves the PDF hash, binds approval to current printer/settings, scopes the file link, and prevents automatic retries. Generic Fo actions remain restricted. Wajo prose and claimed message IDs do not become independently verified delivery: the UI reports the request as unconfirmed and links to Wajo for follow-up.

A live synthetic one-page test was staged through the existing owner's Wajo account. Fo reported decoding the exact PDF and checking its SHA-256. The first request was rejected for an empty email body with zero sends reported; a corrected non-empty-body request was then reported submitted once with the PDF attached from Fo's Wajo assistant sender. Fo subsequently read the actual From header as `Fo <fo@wajo.ai>`. On October 22, the user confirmed that `tatada-20261022-01` printed after they turned the printer on. Physical output for this synthetic test is therefore user-confirmed; no resend was needed. This is a direct provider test, not a production UI/OAuth acceptance test. Private destination, conversation handles and receipts stay in `.local/wajo-print-proof/`.

Before enabling this candidate for users, verify same-device session persistence and isolation between two real Wajo connections, and run the approved PDF flow through the hosted candidate. Existing Supabase accounts must retain access to their workspaces; changing the auth mode is not a data migration. Do not merge or reassign accounts by email. The old beta owner/invitation/feedback controls are Supabase-specific and are not available in Wajo-only mode; use the support contact during that pilot.

Validation for this candidate: type checking and the website build passed; 109 domain tests, 190 API/integration tests passed, and the latest full browser regression passed all 54 desktop/mobile Chromium journeys after the navigation and popup refinements. The suite includes approval binding, lost-response recovery without resend, private signed PDF access, cross-account rejection and both Gmail/Wajo UI paths. A session-expiry event loop found during testing was fixed. Phone screenshots were inspected for hierarchy and overflow. Live two-account Wajo OAuth and printing through the hosted candidate remain separate acceptance checks; the direct synthetic provider test has now reached paper.

The isolated local candidate at port 5197 passed health and live authorization-handoff checks: Wajo returned its authorization endpoint with S256 PKCE. The shared API key is ignored in this mode. The user completed real Wajo sign-in; the backend persisted a session, sealed provider credentials and a workspace. However, the token response contains an opaque access token and no stable subject, and a follow-up authenticated conversation-list check contains conversation metadata but no account identifier. The resulting account is an isolated `connected` browser session, not a verified stable Wajo identity. The owner explicitly scoped this beta to one mobile device per user; cross-device continuity is not a launch gate for this cohort. Do not present Wajo reconnect as guaranteed workspace recovery. Preserve the current device session and offer recovery/export before sign-out or browser-data removal. Printer settings and print jobs were still empty at this check.

The UI now uses a skippable star guide that highlights real controls; Profile can replay it. Home relies on the Trips navigation instead of duplicate action buttons. Trip Mode has one persistent destination/date header and My World exit, plus four bottom destinations. Overview keeps Offline, Before you get there, Share and Calendar in four icon-triggered popups, alongside tasks, pre-trip checks and Manage; Bookings groups Transportation, Stay, Experiences and Eat. Tab changes reset disclosures. Full credits and saved trip research sources live in Profile; OSM attribution is initially visible and collapses to an information control after six seconds, following its attribution guidance. Calls and recordings are not presented as available. Design references: the user's starred [shadcn/ui](https://github.com/shadcn-ui/ui) and [Radix Primitives](https://github.com/radix-ui/primitives); Leaflet was added for the new online trip map. Its tile attribution remains visible as required by the tile provider; it is not part of the collapsing dataset-credit control.

## Mobile context and onboarding update — October 22

The local Wajo-first candidate now has four Itinerary popups (Talk, Plan, Pack, Details), a consistent trip heading hierarchy, and an expanded star guide with topic shortcuts for trips, Trip Mode, maps, Style, Profile and Fo. The guide also covers tasks, documents, printer setup and returning to My World.

Itinerary meals appear in Eat; other planned stops appear in the relevant booking category without becoming confirmed reservations. Meal research sends dated route context, diet and personal needs, requests one to three options per meal, and saves only the traveler’s selected choice. Overview adds an online Leaflet map, confirmed place pins, external directions, optional foreground location and nearby essentials. Existing trips without coordinates need a destination search/confirmation; saved stops need confirmed pins. No offline map tiles, automatic navigation, verified nursing facilities or guaranteed dietary safety are claimed.

Validation: typecheck and website build passed; 112 domain and 190 API tests passed. The 54-journey desktop/mobile Chromium regression passed, followed by expanded-tour/popup checks and six new desktop/mobile checks covering itinerary-to-Eat context, meal research/save and location opt-in/cleanup. Meal research, map tiles and geolocation used controlled fixtures for these checks; live restaurant accuracy, public map coverage and real-phone GPS/Safari remain acceptance work. Mobile popup and map layouts were visually inspected. No hosted deployment was performed.

## Current evidence and remaining work

The old README mixed Wajo login, email OTP, manual provisioning and automatic invitations. The current beta uses **single-use invitations and user-chosen passwords**, with TOTP for sensitive operations. No SMTP setup is needed for this beta. Email is a login label, not proof of ownership.

Local release records dated October 21 report API v6 deployed from `f8e465c`, hosted invitation/password/TOTP/isolation/persistence/session/feedback checks passing, followed by planner deployment from `b726273` and a successful real-provider itinerary check. The native application-data restore was also recorded as verified. These are **historical local records inspected during cleanup**, not checks rerun against production today. Owner activation was recorded as pending; confirm its current status privately before generating any replacement link.

Private evidence stays in `.local/beta-release/`, `.local/planner-release/`, `.local/beta-native-backup/` and the existing private backup directory. The earlier prototype guide and redundant reports are archived under `.local/archive/`. This document is the maintained release guide.

| Priority | Remaining acceptance work | Done when |
| --- | --- | --- |
| P0 | Confirm owner activation and recent TOTP | Owner signs in, can generate/revoke invitations and review feedback; testers cannot |
| P0 | Verify the currently served frontend/API and migrations | Exact deployed revisions identified; hosted login, save/reopen, PDF and disabled-feature boundaries pass |
| P0 | Confirm recovery coverage after Auth users were created | Backup covers current application data plus required Auth/configuration recovery; restore drill preserves identities and revocation state |
| P0 | Run the first-trip journey with two real testers | Both complete invitation → trip → reviewed plan → reopen → PDF/offline use on their actual devices; no unresolved data-loss/auth blocker |
| P1 | Align onboarding and in-app policy copy with beta behavior | Invitation/password flow described accurately; restricted Fo/Google/printing actions do not sound available |
| P1 | Make support and recovery operational | Existing contact page works; owner has a tested lost-password/authenticator procedure and defined feedback review cadence |
| P1 | Check mobile usability and accessibility | Safari/iPhone and Android smoke tests, keyboard/focus, readable text, slow-network/provider-failure recovery |
| P1 | Establish operational visibility and spending limits | Owner can detect failed saves, API/provider failures and unusual spend without logging private trip content |
| P2 | Reduce initial payload and test realistic concurrency | Mobile load budget measured; ten users can save while research runs, with understandable conflicts/retries |

These priorities are recommendations from source review, not proof that every listed condition is currently broken. In-app policies already name the operator and link a contact page; verify that channel rather than treating it as absent. Policies still describe the older temporary-password provisioning flow. The current browser suite targets desktop/mobile Chromium, not Safari or physical devices. The shared hosted write lease merits testing with realistic provider latency before expanding the cohort. The cleanup build reports an approximately 620 kB minified main JavaScript chunk (200 kB gzip) and a FlightTicket dynamic import that cannot split because other screens import it statically; measure first-load performance before treating this as a user-visible defect.

Keep the first beta focused on the journey in [product scope](product.md). Payments, booking automation, cloud document sync and more providers are not prerequisites.

## Cleanup validation

October 22 cleanup checks passed: `npm run typecheck`, `npm run build`, `npm run build:website`, 109 domain tests, 186 API/integration tests, and all 40 desktop/mobile Chromium tests. Component moves were additionally checked to contain only import-path changes. Documentation links and `git diff --check` passed.

The initial sandboxed test run could not bind local server ports; the permitted rerun passed. Build warnings remain for large chunks and the ineffective FlightTicket split described above. Dependency audit, isolated real-Auth smoke, current production checks and physical-device/Safari testing were not rerun during this cleanup. These results establish local code/build integrity, not a new production release.

## 1. Verify the backup first — no paid services

The project is on Supabase Free. No Docker installation, paid resource or permanent local database service is required. The release backup was exported read-only through the existing Supabase connection, encrypted before transport to disk, and verified with the signed official portable Postgres.app PostgreSQL **17.11** binaries in a temporary location.

**Actual result, 2026-10-21:** all current Tatada application data was restored into native PostgreSQL, dumped with `pg_dump`, then restored into a second independent database using `pg_restore`. The complete runtime-row checksum and state checksum matched. RLS still denied direct access to `anon` and `authenticated`. Production was not modified by this check. The temporary database process was stopped afterward.

At the time of that backup, the inspected source had one application table, one legacy account/workspace, **zero Auth users and zero Storage objects**. The backup therefore covers all current Tatada application records and stored functions. It does **not** reconstruct the entire managed Supabase platform/Auth service or its provider/environment configuration. This distinction matters for a future full-project disaster recovery; it must not be presented as a verified full Supabase rebuild. Once Auth users or Storage files exist, they require an expanded backup, and the native verifier deliberately refuses to certify this original narrow export as sufficient.

Private files are retained outside Git at `~/Documents/Tatada-private-backups/2026-10-21-native/`, including `verified-application.dump`, encrypted source metadata, its private restore key and `verified.json`. Directory/file permissions are 0700/0600. Keep an independent secure copy and preserve the existing sealing/service/provider secrets privately; never rotate them as part of this deployment. No tester passwords were created or stored by this backup procedure.

Codex can repeat the connected export and native verification without asking you to administer another service. To repeat only the existing private export's verification while those temporary PostgreSQL binaries are available:

```sh
node scripts/backup-verify.mjs "$HOME/Documents/Tatada-private-backups/2026-10-21-native"
```

`TATADA_POSTGRES_BIN` can point to an existing PostgreSQL 17 binary directory. No database password or Supabase service key is required to verify that already encrypted local export. A successful export alone is not a verified restore. The existing Docker-based draft was replaced by this native procedure.

## 2. Prepare the compatible backend and verify Auth

For a fresh environment, after verifying its backup, apply the required migrations in order through normal Supabase migration tooling. For the existing deployment, inspect migration history first; the local release evidence reports the beta already deployed:

1. `20261021193004_account_session_verification.sql`
2. `20261021201543_private_prototype_invites.sql`
3. `20261021211841_beta_invitations_feedback.sql`

They preserve the runtime row, existing workspaces and encryption secrets. Public signup is guarded by a deferred Auth trigger, matching Admin `createUser` transaction ordering. Beta tables/RPCs are private/service-only. Existing accounts remain UID-owned; legacy recovery keys remain one-use. New invited users choose their own password, so they need no temporary-password rotation. Administrative resets retain the original server-enforced temporary-password change gate and TOTP factors.

Confirm hosted Auth settings in the existing Supabase dashboard:

- Email/password enabled; **Allow new users to sign up OFF**; anonymous sign-ins OFF; unused sign-in providers OFF.
- Minimum password length at least 12; **Require current password when changing password ON** as defense in depth. The backend also verifies current credentials against the same UID independently before changing a temporary password. Email/nonce secure-password-change reauthentication OFF while SMTP is unavailable. No automatic email recovery/password-change notification that requires unconfigured SMTP.
- TOTP enrollment/verification ON; preserve session safeguards, Auth UIDs and factors.
- Site URL stays `https://jayasrisng.com/tatada`. No SMTP, Resend, Google OAuth or new domain is needed.
- Runtime retains its existing server-only credentials and sealing secret. Never put these in `VITE_` variables or browser storage.

Deploy the compatible API only after the critical Auth/isolation/recovery checks on an isolated candidate pass. Do not publish the matching frontend while its API or migrations are missing. The app's health response identifies `0.1.0-beta.1`. The prototype migration makes the pre-prototype Auth helper fail closed; never use a rollback to reopen legacy authentication.

## 3. Bootstrap your owner account once

Only if no owner has already activated, and after confirming migration/candidate compatibility, run this privately:

```sh
node scripts/beta-owner.mjs
```

Enter the existing server-only Supabase key at the hidden prompt. The tool stores only a SHA-256 token hash and copies a 30-minute, single-use owner activation link to your clipboard. Paste it directly into your own browser, choose an email login label and a unique password, activate and sign in. Replace the clipboard afterward. No password is generated, stored or printed by the tool. For the verified local candidate at port 5179, use `node scripts/beta-owner.mjs --local` instead; do not use this flag without that candidate running.

Only the first owner may be bootstrapped. A lost unused setup link expires in 30 minutes before another can be generated. The owner role comes from the private membership table, never editable user metadata. Set up your authenticator under Profile; owner controls require recent verified TOTP. Owner deletion through the app is blocked pending a deliberate recovery plan.

**Email is an unverified login label, not evidence of ownership.** Technical Admin confirmation only avoids SMTP. The permanent Supabase UID and securely claimed invitation establish account access. Never restore, merge or reassign workspaces based on an email address supplied by someone. Existing populated workspaces can be claimed only using their original one-use recovery key after TOTP; never create a replacement account to bypass that protection.

## 4. Invite friends and review feedback

1. Open Profile, verify TOTP, find **Private beta owner**.
2. Select **Generate invitation link**, copy it and share it privately yourself. No automatic email is sent.
3. The friend opens the link, chooses their own login label and strong password, activates and signs in. Each gets an independent permanent UID/workspace. They can use the same credentials on another device.
4. Pending links reserve one of ten slots. They expire in 24 hours. **Revoke link** invalidates an unused link; **Revoke access** immediately removes a claimed tester's application access and frees the slot while retaining their UID/workspace. Revocation survives later Auth login/hash refresh. Never delete/recreate a UID as routine recovery.
5. Testers open **Report a Bug / Send Feedback** inside the app. The form attaches only a coarse page template, app version, phone/desktop class and server timestamp. It does not attach trip IDs, URLs, documents, tokens or travel content. Tell testers not to type private data into the description; obvious credential/link patterns are rejected. Reports are limited to five per account per hour and 500 total.
6. In the owner panel, review open/critical counts, read reports, mark resolved or reopen. Only the owner with fresh TOTP can read or resolve reports.

Password recovery remains administrator-assisted. `scripts/prototype-admin.mjs` can reset an existing UID in your private terminal with a unique temporary password; preserve its factors and require rotation on next login. Do not grant recovery solely because someone knows the unverified login label. No broken automated password-reset link is displayed.

## 5. Required real checks and release order

Keep the private labels **Tester A** and **Tester B** in your own notes. Use two distinct activation links, browser profiles/devices, login labels and passwords chosen privately by their holders. Do not send passwords, invitation tokens, OTPs, recovery keys or setup secrets to Codex.

- Owner activates once, verifies TOTP; an ordinary tester cannot access owner controls or owner endpoints. Wrong credentials, expired/revoked/used links and reused claims fail. Pending and active reservations cap testers at ten, plus the owner.
- A and B independently activate/sign in. Create different harmless test trips, itinerary entries, tasks and packing items. Save, close/reopen and refresh on the same mobile device; verify the saved records return. Cross-device continuity is outside this beta scope. Each sees only their own workspace, account-specific Epson settings and Profile.
- Exercise simultaneous saves by A and B. A stale save by one device produces a conflict without overwriting newer changes or another account's records.
- Enroll/verify TOTP, try an invalid code, unlock and relock sensitive Profile; password reset/rotation retains UID/data/factors and invalidates old sessions. Sign out and recover the session normally. Test the preserved one-use recovery-key flow only with its own disposable legacy workspace.
- Submit harmless normal/critical feedback, review/resolve it as owner; verify no travel data or credentials are attached automatically. Confirm PDF download on phone/laptop. Encrypted travel documents remain local to that device and do not cloud sync.

Release validation CI runs typecheck, the website build, dependency audit, deterministic application/API/PostgreSQL tests and desktop/mobile Chromium journeys. These cover invitation replay, reservations, expiry/revocation, owner/MFA authorization, feedback privacy, ten concurrent isolated API workspaces, conflicts and renewed sessions. They do **not** replace the real checks above.

Before promotion, record the exact passing candidate SHA and previous hosting commit/API bundle privately. Existing hosting is the portfolio repository `jayasrisng/jayasrisng.github.io`; preserve the rest of that site. Promote compatible migrations/API, then only its Tatada public assets through the existing Pages workflow. Build from the exact committed checkout so unrelated untracked local files are not published. Verify the health version, login, saved trip, owner controls and PDF after deployment. Do not merge or promote while a critical gate is unresolved.

## Rollback

Stop promotion/traffic if a critical check fails. Retain Auth UIDs, private invitation/recovery state, runtime data and the existing encryption key; do not restore an older database over production or resurrect used links/recovery keys. Revert the Tatada site assets to the recorded compatible version and redeploy a reviewed API compatible with the installed invitation guard. The original API v5 predates the guard and cannot be treated as a working private-beta authentication rollback. Verify the rollback candidate against the isolated restored database and real Auth before relying on it. The database restore tool verifies recoverable data, not this application rollback by itself.

Payments, document cloud sync, public sharing, Google connections, automatic cloud printing and unsafe Fo execution stay disabled. Existing travel features, PDF downloads, local encrypted documents, account-specific Epson settings and optional owner-bound Wajo connectivity remain.
