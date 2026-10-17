# Fo integration: investigation notes (Oct 17, 2026)

Timebox: 20 min. Inspected local config only: no Fo tools invoked, no network calls to Wajo, no credentials read.

## What we found

| Fact | Evidence |
|---|---|
| Fo is a **remote MCP server over Streamable HTTP** at `https://mcp.api.wajo.ai/fo` | `~/.claude.json` → `projects.<tatada>.mcpServers.fo = { type: "http", url }` |
| **No static API key or headers** are configured | The `fo` entry has only `type` and `url` keys |
| Auth is therefore **MCP OAuth**, completed interactively by Claude Code; the token sits in Claude Code's credential store (macOS Keychain) | No header/token in config; Keychain entry exists (not read) |
| Tools exposed: `ask_fo`, `get_fo_reply`, `start_fo_call`, `list_fo_conversations`, `get_fo_conversation` | Tool schemas loaded in Claude Code |
| Fo is **conversational, not typed**: one free-text `message` in, prose out; long tasks return `status: "working"` and must be polled (≤40s per poll) | Tool descriptions |
| Fo acts **as the account owner** (their email, calendar, phone, card) | Server instructions |
| `start_fo_call` is a voice link for the **user** to talk to Fo, not an outbound call to a business | Tool description |

## Implications for Tatada

1. **Our backend can't reuse Claude Code's token.** It must become its own MCP OAuth client against the Wajo authorization server, or get a server-to-server credential from Wajo.
2. **The approval gate stays in our code.** The backend only calls `ask_fo` after an action record is in the `approved` state. Claude never holds the Fo tool directly in the MVP.
3. **We parse prose into status.** After Fo replies, Claude extracts `{done, summary, evidence[]}` from the reply. "Verified" requires evidence (e.g., Fo reading back the confirmation email).
4. **Polling loop on the server**, streamed to the UI as progress lines (the UI already renders this shape).

## Recommended bridge (to build once approved)

```
UI ──approve(actionId)──▶ /api/actions/:id/approve
                           └─ ask_fo(message = approved script + context)
                           └─ loop get_fo_reply until complete|failed|needs-user
                           └─ Claude: extract result + evidence → action record
UI ◀──SSE progress/result──┘
```

Options for the MCP client, in order of preference:
- **A. Claude API MCP connector** (`mcp_servers` with `authorization_token`): simplest if we obtain an OAuth token for our app. However, Claude would then hold the tool, so we'd restrict it to a single, approved turn.
- **B. Direct MCP client in our backend** (`@modelcontextprotocol/sdk`, Streamable HTTP + OAuth): full control over exactly when `ask_fo` fires. **Preferred for the trust story.**

## Open blockers / next steps (each needs your go-ahead)

1. **Unauthenticated discovery check:** `GET https://mcp.api.wajo.ai/.well-known/oauth-protected-resource` (and the auth server metadata) to confirm whether dynamic client registration is supported. This is a network call to Wajo, so it hasn't been run.
2. Ask Wajo hackathon organizers whether third-party apps get a client ID or API key.
3. One harmless real Fo task (e.g., "what integrations do I have connected?") to learn real capabilities and latency.
4. **Fallback if 1–2 are blocked:** demo the real Fo action from Claude Code (this session) driven by the same approved script, and show its result in the app. It's honest, but less seamless.
