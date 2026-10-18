import { Buffer } from 'node:buffer'
import { sha256 } from './crypto.ts'
import type { McpClient } from './mcp.ts'
import { describeShape } from './fo.ts'

/*
 * Wajo identity. Wajo publishes OAuth for Fo but no OpenID Connect (no
 * id_token, userinfo, or JWKS), so a user id can only come from what Wajo
 * itself returns after consent. Accepted sources, in order:
 *
 *   1. token_response       an id field in the token endpoint's JSON. Our server
 *                           receives it directly from Wajo over TLS, bound to our
 *                           PKCE login, so it is Wajo's statement, not the user's.
 *   2. access_token_claims  `sub` in the access token, if it is a JWT whose `iss`
 *                           is Wajo's issuer and that hasn't expired. Same TLS-direct
 *                           provenance; signature can't be checked (no JWKS).
 *   3. fo_api               an account field in an authenticated, read-only Fo
 *                           response (list_fo_conversations), consistent across items.
 *
 * Never accepted: anything from conversational text, an email typed by anyone,
 * or browser-supplied values. If none of these yields an id, login is refused.
 */

export interface WajoIdentity {
  issuer: string
  subject: string
  source: 'token_response' | 'access_token_claims' | 'fo_api'
  field: string
}

const ID_FIELDS = ['sub', 'user_id', 'userId', 'account_id', 'accountId', 'uid', 'owner_id', 'ownerId']
const usable = (v: unknown): v is string | number =>
  (typeof v === 'string' && v.trim().length >= 3 && v.length <= 200) || (typeof v === 'number' && Number.isSafeInteger(v))

export function fromTokenResponse(body: Record<string, unknown>, issuer: string): WajoIdentity | null {
  for (const field of ID_FIELDS) {
    if (usable(body[field])) return { issuer, subject: String(body[field]), source: 'token_response', field }
  }
  return null
}

export function fromAccessToken(token: string, issuer: string, nowMs: number): WajoIdentity | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>
    if (String(claims.iss ?? '').replace(/\/$/, '') !== issuer.replace(/\/$/, '')) return null
    if (typeof claims.exp === 'number' && claims.exp * 1000 < nowMs) return null
    return usable(claims.sub) ? { issuer, subject: String(claims.sub), source: 'access_token_claims', field: 'sub' } : null
  } catch {
    return null
  }
}

/** Read-only: looks for one account id shared by the response or all its conversations. */
export async function fromFoApi(mcp: McpClient, token: string, issuer: string): Promise<{ identity: WajoIdentity | null; shape: unknown }> {
  const r = await mcp.callTool(token, 'list_fo_conversations', {})
  let p: unknown = r.structuredContent
  if (p === undefined) {
    const text = (r.content ?? []).map((c) => c.text ?? '').join('').trim()
    try {
      p = text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : undefined
    } catch {
      p = undefined
    }
  }
  const shape = p === undefined ? 'text' : describeShape(p)
  if (!p || typeof p !== 'object') return { identity: null, shape }
  const top = p as Record<string, unknown>
  for (const field of ID_FIELDS) if (usable(top[field])) return { identity: { issuer, subject: String(top[field]), source: 'fo_api', field }, shape }
  const items = (Array.isArray(p) ? p : top.conversations) as unknown[] | undefined
  if (Array.isArray(items) && items.length) {
    for (const field of ID_FIELDS) {
      const values = new Set(items.map((i) => (i && typeof i === 'object' ? (i as Record<string, unknown>)[field] : undefined)))
      const [only] = [...values]
      if (values.size === 1 && usable(only)) return { identity: { issuer, subject: String(only), source: 'fo_api', field: `conversations[].${field}` }, shape }
    }
  }
  return { identity: null, shape }
}

/** Stable lookup key for a Wajo user; the raw subject isn't used as a key. */
export const subjectKey = (id: WajoIdentity) => sha256(`${id.issuer}|${id.subject}`)
