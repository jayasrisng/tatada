# Tatada private beta — release and owner guide

Candidate version: **0.1.0-beta.1**, built on validated `1143819` on `melon/v0.1-alpha`. The owner is separate from **10 tester slots**. Existing Supabase project and `https://jayasrisng.com/tatada/` are retained. This document supersedes the original manual-provisioning flow in `PROTOTYPE.md`.

**This is candidate code, not a declaration of deployment.** The last inspected production API was v5; neither the prototype nor beta invitation migration was applied. CI fixtures are simulated, even when they execute real PostgreSQL or Chromium. A real backup restore and real Auth/TOTP checks are release gates.

## 1. Verify the backup first — no paid services

The project is on Supabase Free. Do not assume a daily managed backup exists. Docker Desktop was not found during inspection. Install/start Docker Desktop locally; do not purchase a Supabase upgrade or create another cloud project. Keep Docker available until the restore check finishes.

In your own private, non-recorded terminal, from this repository, using Node 24:

```sh
npm ci
node scripts/backup-verify.mjs "$HOME/Documents/Tatada-private-backups"
```

The tool asks privately for a Supabase personal access token and the **existing database password**. Never paste either into Codex. It also requires you to confirm that the existing sealing secret/service key and provider secrets are retained privately. Do not reset the database password or rotate any encryption/provider key merely to run this check. If you cannot recover those existing secrets, stop and identify that as a recovery blocker.

The pinned Supabase CLI exports roles, application schemas, data and custom Auth/storage schema changes from a separate empty work directory. Source queries only read table counts/checksums. An independent local Supabase PostgreSQL 17 stack is created, restored and compared with the source; a second source manifest detects changes during export. The tool stops its own disposable local stack afterward. It never restores into production or provisions a paid resource. If source Storage objects exist, it stops because their files require separate backup. Platform migration ledgers are excluded from row comparison/import; all application/Auth/storage table data is checked.

Dumps contain private information and Auth records. They are created outside the repository with private file permissions; use an encrypted disk and keep an independent secure copy. Keep `verified.json` privately. A successful export without the successful restore/comparison message is **not verified**. Report only success or the generic error—not dump contents or credentials. This new automation still requires its first real Docker execution; no real restore has been claimed.

## 2. Prepare the compatible backend and verify Auth

After the backup has actually passed, apply these in order through normal Supabase migration tooling:

1. `20261021201543_private_prototype_invites.sql`
2. `20261021211841_beta_invitations_feedback.sql`

They preserve the runtime row, existing workspaces and encryption secrets. Public signup is guarded by a deferred Auth trigger, matching Admin `createUser` transaction ordering. Beta tables/RPCs are private/service-only. Existing accounts remain UID-owned; legacy recovery keys remain one-use. New invited users choose their own password, so they need no temporary-password rotation. Administrative resets retain the original server-enforced temporary-password change gate and TOTP factors.

Confirm hosted Auth settings in the existing Supabase dashboard:

- Email/password enabled; **Allow new users to sign up OFF**; anonymous sign-ins OFF; unused sign-in providers OFF.
- Minimum password length at least 12; **Require current password when changing password ON**. Email/nonce secure-password-change reauthentication OFF while SMTP is unavailable. No automatic email recovery/password-change notification that requires unconfigured SMTP.
- TOTP enrollment/verification ON; preserve session safeguards, Auth UIDs and factors.
- Site URL stays `https://jayasrisng.com/tatada`. No SMTP, Resend, Google OAuth or new domain is needed.
- Runtime retains its existing server-only credentials and sealing secret. Never put these in `VITE_` variables or browser storage.

Deploy the compatible API only after the critical Auth/isolation/recovery checks on an isolated candidate pass. Do not publish the matching frontend while its API or migrations are missing. The app's health response identifies `0.1.0-beta.1`. The prototype migration makes the pre-prototype Auth helper fail closed; never use a rollback to reopen legacy authentication.

## 3. Bootstrap your owner account once

After the migration is present and the matching candidate is available, run this privately:

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
- A and B independently activate/sign in. Create different harmless test trips, itinerary entries, tasks and packing items. Save, close/reopen, refresh and sign in from a second device; verify the same UID's records return. Each sees only their own workspace, account-specific Epson settings and Profile.
- Exercise simultaneous saves by A and B. A stale save by one device produces a conflict without overwriting newer changes or another account's records.
- Enroll/verify TOTP, try an invalid code, unlock and relock sensitive Profile; password reset/rotation retains UID/data/factors and invalidates old sessions. Sign out and recover the session normally. Test the preserved one-use recovery-key flow only with its own disposable legacy workspace.
- Submit harmless normal/critical feedback, review/resolve it as owner; verify no travel data or credentials are attached automatically. Confirm PDF download on phone/laptop. Encrypted travel documents remain local to that device and do not cloud sync.

Release validation CI runs typecheck, the website build, dependency audit, deterministic application/API/PostgreSQL tests and desktop/mobile Chromium journeys. These cover invitation replay, reservations, expiry/revocation, owner/MFA authorization, feedback privacy, ten concurrent isolated API workspaces, conflicts and renewed sessions. They do **not** replace the real checks above.

Before promotion, record the exact passing candidate SHA and previous hosting commit/API bundle privately. Existing hosting is the portfolio repository `jayasrisng/jayasrisng.github.io`; preserve the rest of that site. Promote compatible migrations/API, then only its Tatada public assets through the existing Pages workflow. Build from the exact committed checkout so unrelated untracked local files are not published. Verify the health version, login, saved trip, owner controls and PDF after deployment. Do not merge or promote while a critical gate is unresolved.

## Rollback

Stop promotion/traffic if a critical check fails. Retain Auth UIDs, private invitation/recovery state, runtime data and the existing encryption key; do not restore an older database over production or resurrect used links/recovery keys. Revert the Tatada site assets to the recorded compatible version and redeploy a reviewed API compatible with the installed invitation guard. The original API v5 predates the guard and cannot be treated as a working private-beta authentication rollback. Verify the rollback candidate against the isolated restored database and real Auth before relying on it. The database restore tool verifies recoverable data, not this application rollback by itself.

Payments, document cloud sync, public sharing, Google connections, automatic cloud printing and unsafe Fo execution stay disabled. Existing travel features, PDF downloads, local encrypted documents, account-specific Epson settings and optional owner-bound Wajo connectivity remain.
