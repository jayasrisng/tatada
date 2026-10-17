# Fo integration: auth & capability discovery

Last updated Oct 17, 2026. All checks were unauthenticated and read-only: public metadata GETs, MCP `initialize`, and `*/list`. **No `tools/call`, no client registration, no credentials used.** The probe script lives outside the repo (`/tmp/tatada-probe/probe.py`).

## Verdict

**Yes. Our backend can authenticate to Fo with standard MCP OAuth 2.1, without needing anything from Wajo first.** The server advertises dynamic client registration and public clients with PKCE, so Tatada can register itself, send the user through a one-time consent screen, and hold a refreshable bearer token server-side.

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
- `prompts/list` and, by extension, `tools/call`: **401** `{"error":"missing api key"}` + `WWW-Authenticate: Bearer resource_metadata=…`
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

## How the backend would connect

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
- **Tokens never reach the browser.** They're stored server-side, encrypted at rest (or in the OS keychain for the local demo), and refreshed automatically.
- **No generic proxy.** The backend exposes only narrow endpoints, e.g. `POST /api/actions/:id/approve`. That endpoint is the *only* code path that calls `ask_fo`.
- **Approval is bound to content.** On approve we hash the exact message; `ask_fo` sends that message and nothing else. Any edit requires re-approval.
- **Fo's own confirmations go back to the user.** If Fo replies "waiting for your answer," the UI shows the question. The backend never auto-confirms.
- **"Verified" requires evidence** (e.g. `get_fo_conversation` transcript or a confirmation Fo read back). Otherwise the action is marked "done (unverified)."
- **State + PKCE** on the OAuth flow; the redirect URI is pinned at registration.

## Still unknown (needs approval to test)
1. Whether `/oauth/register` accepts `http://localhost` redirect URIs. Registration creates a record on Wajo, so it's a write.
2. Token lifetime and refresh behaviour.
3. Whether one `mcp` token covers both `/fo` and `/mcp` (the `resource` param suggests per-resource tokens).
4. Real latency and capability of `ask_fo`, especially outbound calls to businesses.

## Fallback
If registration is rejected, run the approved message through Fo from Claude Code (already authenticated) and paste or ingest the result into Tatada, clearly labeled.
