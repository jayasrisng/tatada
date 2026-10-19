# Gmail print connection

Tatada has its own Gmail OAuth connection. The Gmail connector in Codex does not give a standalone web app reusable Google credentials. No password or token should be pasted into chat.

## One-time app setup

1. In a Google Cloud project, enable the **Gmail API**. Configure Google Auth Platform branding/audience. During development, use Testing and add your own Google account as a test user.
2. Create an OAuth client with application type **Web application**.
3. Add this exact authorized redirect URI for the current preview:

   `http://127.0.0.1:5180/api/gmail/callback`

4. Save the client values in the private, ignored `.env` file:

   ```dotenv
   GOOGLE_CLIENT_ID=<your OAuth web client ID>
   GOOGLE_CLIENT_SECRET=<your OAuth client secret>
   GOOGLE_REDIRECT_URI=http://127.0.0.1:5180/api/gmail/callback
   ```

5. Restart the local preview with `TATADA_DEV_PORT=5180 npm run dev`.
6. In Tatada, open your profile or a trip's Print screen and click **connect Gmail**. Review and grant Google's consent. Tatada requests `openid`, `email` and `gmail.send`; it does not request inbox-reading permission.
7. If Epson uses Approved Senders, add the connected Gmail address. In Epson Print Settings, turn off Print Email Body and Print Sender's Information to avoid extra pages. Those are printer-side settings; an app cannot silently change them by emailing a PDF.

The saved printer address and repeat-print choice remain on the account. After connecting, a fresh Print action prepares and sends the PDF; unsupported settings, duplicates and uncertain sends still stop for clarification.

## Implementation and limits

- Browser-bound, account-bound, one-use OAuth state; PKCE; Google verifies the connected email identity.
- Access/refresh tokens are sealed with the server's existing encryption key and excluded from workspace exports.
- Automatic refresh with single-flight requests and disconnect-race protection.
- Only the prepared PDF is attached, with no text email body; the transport restricts recipients to Epson Connect addresses.
- Gmail success means a message was accepted, not that physical paper printed.
- Timeouts and ambiguous Gmail responses become uncertain; they are never blindly retried. The send-only scope deliberately cannot search/read Sent Mail to reconcile them.
- Google may limit testing-mode authorizations. Public release requires Google's applicable consent/verification configuration and a deployed callback URL.
- This implementation is wired into the local runtime. The Supabase-hosted adapter still needs its own Gmail configuration and callback/session integration before hosted readiness can be claimed.

October 19, 2026: Gmail API is enabled in Google project `tatada-512116`. The approved web client “Tatada local Gmail printing” uses the local callback above; the owner’s Gmail account is the sole test user. Its credentials are stored only in the ignored local `.env` with mode 0600. After the owner approved the final send-only Google consent, the real OAuth callback succeeded. Both the live API and Tatada profile confirm `configured: true`, `connected: true` for the approved owner account. Tokens are sealed by the existing local server encryption key. Connection evidence: `docs/verification/google-gmail-connected.png`. No email has been sent. Automated transport tests still use fake Google responses and an intercepted printer-delivery fixture.

References: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail send and attachments](https://developers.google.com/workspace/gmail/api/guides/sending), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).

## Fo's existing Gmail connection

Live capability check on October 18, 2026: Wajo's exposed `ask_fo` tool accepts a message string, conversation ID and new-conversation flag. It exposes no attachment upload or email-with-file contract. A Gmail connection inside Wajo does not by itself let Tatada deliver the exact approved PDF. No print job was sent during this check.

To use Fo for delivery, Wajo must expose a supported attachment-send/upload mechanism (or document an authenticated HTTPS file-fetch workflow), recipient selection, and a delivery identifier. Tatada must then wire the approved PDF bytes into that contract, preserve authorization and duplicate protection, and handle ambiguous delivery without blind retries. Do not replace a PDF with a text description or report success from a text-only response. Until this is supported and verified, the implemented delivery path is Tatada's Gmail OAuth integration.

## October 19 continuation

The hosted adapter now accepts optional Google configuration. Bearer-session consent uses authenticated prepare → Google callback staging → same-account/tab-bound completion. It does not rely on third-party cookies. See [release preparation](production-readiness-2026-10-19.md) for the exact hosted callback and secret names. Fixture tests cover the staged flow; actual Google registration, consent, Epson sender approval and paper output still require the owner. No real email was sent.
