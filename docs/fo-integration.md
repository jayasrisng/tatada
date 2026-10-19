# Fo integration: auth & capability discovery

Discovery notes from Oct 17, 2026. The initial checks used public metadata GETs, MCP `initialize`, and `*/list`. The implemented client and its current verification limits are described below.

## Verdict

The server advertises dynamic client registration and public clients with PKCE. Tatada implements that OAuth flow, but registration and redirect to Wajo consent were verified from the hosted Supabase API. Completing consent, token refresh, and an actual Fo action still require a user-authorized live session.

## Evidence

**Protected resource** `GET /.well-known/oauth-protected-resource/fo`
```json
{ "resource": "https://mcp.api.wajo.ai/fo", "authorization_servers": ["https://mcp.api.wajo.ai"],
  "bearer_methods_supported": ["header"], "scopes_supported": ["mcp"] }
```

**Authorization server** `GET /.well-known/oauth-authorization-server`
```json
{ "issuer": "https://mcp.api.wajo.ai",
  "authorization_endpoint": "https://mcp.api.wajo.ai/oauth/authorize",
  "token_endpoint": "https://mcp.api.wajo.ai/oauth/token",
  "registration_endpoint": "https://mcp.api.wajo.ai/oauth/register",
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"], "scopes_supported": ["mcp"] }
```

**Unauthenticated behaviour of `POST /fo`** (Streamable HTTP, protocol `2025-06-18`, server `wajo-fo 0.1.0`, stateless: no session id)
- `initialize`, `tools/list`, `resources/list`: **public** (200)
- `prompts/list`: **401** `{"error":"missing api key"}` + `WWW-Authenticate: Bearer resource_metadata=…`
- `tools/call` authorization was not tested in the initial discovery; its behavior cannot be inferred from `prompts/list`.
- The "api key" wording suggests a separate API-key path also exists, but it isn't documented in the metadata.

**Fo tools, with the server's own safety annotations**

| Tool | readOnly | destructive | openWorld | Use in Tatada |
|---|---|---|---|---|
| `ask_fo(message, conversationId?, newConversation?)` | no | **yes** | **yes** | Only after explicit approval of the exact message |
| `get_fo_reply(conversationId?, waitSeconds≤40)` | yes | no | no | Server-side polling loop |
| `get_fo_conversation(conversationId)` | yes | no | no | Evidence: read back Fo's transcript |
| `list_fo_conversations()` | yes | no | no | Optional history |
| `start_fo_call()` | no | no | no | Voice link for the *user*; ships an MCP-UI call panel (`ui://wajo-fo/call`, LiveKit) |

**Bonus: second server `wajo-agentmcp` at `/mcp`** (same OAuth issuer). It's an agent-builder platform: `build_agent`, `chat_agent`, `build_connector`, `update_agent` (including outbound-voice instructions), and **`register_webhook(url, name, eventKinds)`**. Webhooks could replace polling later. This is out of MVP scope.

## API key check (Oct 18, 2026, read-only)

`.env` holds `WAJO_FO_ENDPOINT` (`https://mcp.api.wajo.ai/fo`) and `WAJO_FO_API_KEY`. Only `initialize`, `tools/list`, `prompts/list`, `resources/list`, `search_documentation` and `list_connectors` were called. Nothing was sent.

- **Authentication:** Wajo's docs say developer tools send a `wak_` key as `X-API-Key` or `Authorization: Bearer`, and that "every request is scoped to the authenticated user". The key worked as a Bearer token: `prompts/list` returned 401 without it and 200 with it.
- **Identity:** a key acts as its one Wajo account. Tatada therefore uses it only in single-owner mode (`TATADA_SINGLE_OWNER=1`, localhost only) as the owner's credential, and ignores it in multi-user mode, which keeps per-user OAuth. It never identifies a Tatada user.
- **What `ask_fo` accepts:** its schema is `{message, conversationId?, newConversation?}` with `additionalProperties: false`. There's no attachment or file argument, so Tatada can't give Fo a PDF.
- **Sender account:** no Fo tool shows which email account Fo sends from. Wajo's docs say OAuth-backed services (such as email) are connected in the Wajo Integrations UI. `list_connectors` on `/mcp` lists custom HTTP connectors only, none for email.
- **Runtime check:** `/api/fo/status` now reports `capabilities` (attachments, senderVisible) derived from the live schema. Printing uses the same check.
- **Handling the key:** `server/env.ts` loads `.env` (shell variables win) and logs variable names only. The key isn't sent to the browser, logged, stored in server data, or committed (`.env` is gitignored).

## How the backend connects (implemented in `server/`)

```
1. Register (once)  POST /oauth/register  {client_name:"Tatada", redirect_uris:[<backend>/oauth/callback],
                                           grant_types:[authorization_code, refresh_token],
                                           token_endpoint_auth_method:"none"}  → client_id
2. Consent (once)   browser → /oauth/authorize?response_type=code&client_id&redirect_uri
                                &code_challenge=S256(verifier)&scope=mcp&resource=https://mcp.api.wajo.ai/fo&state
3. Exchange         POST /oauth/token  code + code_verifier → access_token (+ refresh_token)
4. Use              POST /fo  Authorization: Bearer <token>   (MCP over Streamable HTTP)
```

### Security rules
- **Tokens never reach the browser.** They're stored server-side, sealed at rest in the server data directory, and refreshed automatically.
- **No generic proxy.** The backend exposes only narrow endpoints, e.g. `POST /api/actions/:id/approve`. Approval queues the initial `ask_fo` call; an explicit owner answer can also call `ask_fo` in the same conversation.
- **Approval is bound to content.** On approve we hash the exact message; `ask_fo` sends that message and nothing else. Any edit requires re-approval.
- **Fo's own confirmations go back to the user.** If Fo replies "waiting for your answer," the UI shows the question. The backend never auto-confirms.
- **"Verified" requires a structured provider record** for the approved recipient. Plain conversation claims are insufficient. Unconditional early-check-in confirmation is a separate result from merely sending the request.
- **State + PKCE** on the OAuth flow; the redirect URI is pinned at registration.

## Implementation status

Implemented and tested against a fake Wajo (`server/tests/oauth.test.ts`) and the mock adapter (`server/tests/actions.test.ts`): discovery, registration, state + PKCE, code exchange, sealed tokens, refresh, 401 retry, approval binding, idempotency, duplicate guard, reconciliation, needs-input, timeout, restart recovery, and evidence-based verification.

**Hosted registration verified:** the Supabase API successfully registered Tatada and returned a redirect to Wajo's `/oauth/authorize` endpoint with a login cookie. Consent completion, refresh, and the real shape of authenticated Fo replies/transcripts remain unverified. The parsers accept several shapes, and an unrecognized shape degrades to "working" or "unverified", never to "done". If Fo's transcript doesn't expose tool send records, live actions will end as *unverified* until the evidence rules are adjusted to what Fo actually returns.

## Still unknown (needs approval to test)
1. Consent completion and local redirect registration; the hosted HTTPS redirect is registered.
2. Token lifetime and refresh behaviour.
3. Whether one `mcp` token covers both `/fo` and `/mcp` (the `resource` param suggests per-resource tokens).
4. Real latency and capability of `ask_fo`, especially outbound calls to businesses.

## If live integration is unavailable
Run the labeled mock adapter. The app does not implement importing manually executed Fo tasks, and Claude Code credentials must not be reused by the server.

## Hosted runtime

The website frontend lives at `/tatada/` on GitHub Pages. Its Supabase Edge API is `https://utmbjcgttsjvdpghiqkf.supabase.co/functions/v1/tatada-api`. Postgres stores private runtime state under a service-role-only table with RLS enabled. Database leases serialize writes and are checked before provider calls. Hosted sessions use browser-bound, one-use sign-in exchanges and tab-scoped bearer tokens; Wajo tokens never reach the browser. When a stable Wajo identity is unavailable, OAuth may create a separate private connection session, explicitly labeled in the profile; accounts are never merged by a guessed identity.
