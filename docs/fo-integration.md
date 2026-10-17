# Fo integration: auth & capability discovery

Discovery notes from Oct 17, 2026. The initial checks used public metadata GETs, MCP `initialize`, and `*/list`. The implemented client and its current verification limits are described below.

## Verdict

The server advertises dynamic client registration and public clients with PKCE. Tatada implements that OAuth flow, but successful registration, consent, and token refresh against the live provider still need verification.

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

**Not yet verified against the real Wajo server.** Advertised metadata is evidence that OAuth should work, not proof. Two things are still unknown: whether registration accepts the redirect URI, and the real shape of Fo's replies and transcripts. The parsers accept several shapes, and an unrecognized shape degrades to "working" or "unverified", never to "done". If Fo's transcript doesn't expose tool send records, live actions will end as *unverified* until the evidence rules are adjusted to what Fo actually returns.

## Still unknown (needs approval to test)
1. Whether `/oauth/register` accepts `http://localhost` redirect URIs. Registration creates a record on Wajo, so it's a write.
2. Token lifetime and refresh behaviour.
3. Whether one `mcp` token covers both `/fo` and `/mcp` (the `resource` param suggests per-resource tokens).
4. Real latency and capability of `ask_fo`, especially outbound calls to businesses.

## If live integration is unavailable
Run the labeled mock adapter. The app does not implement importing manually executed Fo tasks, and Claude Code credentials must not be reused by the server.
