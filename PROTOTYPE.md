> For the current automatic-invitation beta (owner plus ten testers), use [BETA.md](BETA.md). This earlier manual-provisioning document is retained for administrator-assisted recovery and historical context.

# Tatada v0.1 private prototype — owner procedure

This candidate updates `melon/v0.1-alpha` from `22f026b`. It supports at most **10 active invited Supabase UIDs**. There is no public registration, automated email password recovery, payment processing, document cloud synchronization, public share-link access or cloud-print delivery. PDF download and account-specific Epson settings remain available. Wajo is optional and unsafe Fo execution remains disabled.

## Release gates

Do not promote the website or API until all of these are recorded as passed:

1. Exact candidate commit passes Release validation CI.
2. A usable, independent backup has been restored in an isolated target and checked, including the existing runtime data, ownership/recovery records and Auth UIDs. Never restore over the live project to rehearse this. Keep the current sealed-token encryption key, provider configuration and previous API/site artifacts privately so existing encrypted provider connections can be recovered. Do not rotate that key as part of this release.
3. The hosted migration and Auth settings below are verified, then two **real, separately provisioned** users pass the manual checks below. Synthetic CI fixtures do not satisfy this gate.

The SQL tests run the migration and declarative schema in isolated in-memory PostgreSQL, without reading or changing live account data. Neither that test nor a mapping-only rollback rehearsal proves that a live backup is usable. If the project has no managed backup, create a private logical backup with Supabase's documented CLI procedure and restore it to an isolated target first. Do not put dumps, credentials or recovered data in Git, CI artifacts or chat. The dashboard/backup owner must identify the actual backup and restore target before release.

## Supabase settings (project `utmbjcgttsjvdpghiqkf`)

Use the existing Supabase project and existing website; no new domain or email provider is needed.

- Disable **Allow new users to sign up**. Keep email/password authentication enabled. Disable anonymous sign-ins and unused external sign-in providers. The database also rejects unprovisioned Auth inserts.
- Set minimum password length to **12 or greater**. Enable **Require current password when changing password**. Do **not** enable the separate email/nonce reauthentication requirement while SMTP is unavailable. Do not enable password-change email notifications that require an unconfigured email provider.
- Keep TOTP enrollment and verification enabled. Preserve existing session settings, factors and Auth UIDs. Existing recent-TOTP requirements still apply to sensitive Profile operations, recovery-key migration and administrative-password-reset completion for an already enrolled user.
- Keep the existing site URL `https://jayasrisng.com/tatada`. Password sign-in does not need an email redirect. No Resend, Google OAuth or SMTP setup is required.
- After the usable backup is verified, apply `supabase/migrations/20261021201543_private_prototype_invites.sql` through the normal Supabase migration tooling. It adds private invitation state and Auth triggers and replaces the existing service-only session helper. It does not rewrite runtime data or migrate existing users automatically. Old API builds fail closed through their old Auth-session RPC; the candidate uses a separate prototype RPC so older servers cannot bypass the new password gate. Review any existing Auth users before deliberately admitting them.
- Keep service credentials only in the backend/runtime and owner administrative tools. Never prefix them with `VITE_`, put them in browser storage, commit them or paste them into chat.

The repository's `supabase/config.toml` mirrors the local signup/password-length/TOTP defaults. Editing that file alone does not change the hosted Auth settings.

## Provision accounts without SMTP

Use Node 24 and install the locked dependencies with `npm ci`. Run this **yourself** in a private, non-recorded terminal:

```sh
node scripts/prototype-admin.mjs
```

Choose `create`. Enter the invited email, the project's server-only secret/service-role key at the hidden prompt, and a **new, unique random temporary password of at least 20 characters** generated in your password manager. Confirm the password at the second hidden prompt. The tool uses Supabase's Admin API with `email_confirm: true`; it sends no invitation or confirmation email. It stores no passwords or credentials in files, shell arguments or logs and prints only the resulting UID/status. Do not run it through a terminal recorder, CI, redirection or an AI-visible terminal transcript.

Create each tester separately. Label the two verification users **Tester A** and **Tester B** in your private notes; record each permanent UID. Generate an independent temporary password for every account and every reset, and deliver it through your usual secure private channel. Never share an account. Do not send passwords, TOTP codes, authenticator setup keys, recovery keys or service credentials back to Codex.

The Admin API supplies trusted `app_metadata.tatada_prototype=true` plus a fresh reset nonce. Only administrative credentials can set that metadata. User-editable metadata cannot grant admission or clear the password gate. The database serializes slot allocation and refuses an eleventh active invitation. A newly admitted account stays locked even when it has a valid Auth token: the app loads no workspace before rotation.

For an existing invited account, choose `reset` and enter its **existing UID**, never delete and recreate it. This sets a unique temporary password and fresh reset nonce, preserves the UID, workspace mapping and TOTP factors, invalidates earlier application sessions and requires first-login rotation again. Recovery is administrator-assisted; the login screen offers no automated reset link. If a user also loses their authenticator, use a separately verified owner recovery process; this tool deliberately does not remove MFA.

Choose `revoke` to remove application admission and free its slot while retaining its Auth UID and Tatada workspace. Check the UID carefully. A later deliberate administrative reset re-admits the same UID if a slot is available.

## Verify two real users before promotion

After backup, migration and hosted settings are verified, run the same owner tool and choose `preview`. At its prompts enter the server key and the separate **public** anon/publishable key. It starts a production-built frontend at `http://127.0.0.1:5179/` with a loopback-only backend, real Supabase Auth, and isolated local workspace data under ignored `.local/prototype-live-check/`. It does not change the production runtime row or use Wajo, Google or a printer. The server credential is passed only to the backend child, never the frontend build. Stop it with Ctrl+C. This checks real Auth behavior against the candidate without publishing the website.

Use separate browser profiles for A and B; do not record the login/password/TOTP screens.

1. Sign in as A using its temporary password. Refresh: the password-change screen must persist and no workspace may appear. Choose a different strong password and confirm it. The backend must confirm the Auth update before clearing the gate; a hash rewrite or profile metadata edit cannot unlock it. Sign in again with the new password. The old temporary password must fail.
2. Enroll TOTP in Profile with your authenticator. An incorrect code must fail. A correct code unlocks sensitive Profile data; explicit lock and refresh/tab-session safeguards must work. Never record the QR secret or codes.
3. Add a harmless A-only trip marker and Epson setting. Repeat initial rotation and TOTP with B. B must see neither A's marker nor A's printer settings; A must not see B's. Verify both directions after refresh. Download a trip PDF. Cloud send/approve and Google-connection routes must remain unavailable.
4. Close/reopen or refresh A's browser: its session restores the same UID/workspace; sensitive operations still require recent TOTP. Sign out and ensure the device session ends.
5. Exercise administrator-assisted reset on A with its **same UID**. The prior browser session must lose application access; the new temporary password must again require rotation (including the existing authenticator). After changing it and signing in anew, the UID, trip marker and Epson settings must remain the same, and B must remain unaffected.
6. If migrating an actual older workspace, use its existing one-use recovery key only through the protected account migration screen after password rotation and TOTP. Confirm its original owner/data remain intact and a second use fails. Do not invent or publish a recovery key. Synthetic tests already cover transactional single-use and concurrent-claim behavior; record a real migration separately when an old workspace is available.

Report only pass/fail, non-sensitive tester labels/UIDs and any visible error text. Do not claim real checks complete until they have actually run. After all release gates pass, deploy this exact API and website candidate to the existing `jayasrisng.com/tatada` target and confirm the deployed login is invite-only. Rollback must retain the prototype admission gate; use maintenance mode if no compatible build exists. Do not reinstate public Wajo login or restore an old runtime row over new user data. Leave the additive invitation/session guards and all existing mappings/recovery history in place.

References: [Supabase admin provisioning](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [password security](https://supabase.com/docs/guides/auth/password-security), [database backups](https://supabase.com/docs/guides/platform/backups).
