import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { FoOAuth, OAuthError } from '../oauth.ts'
import { Sealer } from '../crypto.ts'
import { Store } from '../store.ts'
import { LiveFoAdapter } from '../fo.ts'
import { McpClient } from '../mcp.ts'

const RESOURCE = 'https://mcp.test/fo'
const ISSUER = 'https://mcp.test'

/** A fake Wajo: discovery, registration, token endpoint, and an MCP endpoint. */
function fakeWajo() {
  const calls: { url: string; body?: string; auth?: string }[] = []
  let tokenN = 0
  let accessValid = new Set<string>()
  const json = (status: number, body: unknown, type = 'application/json') => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': type } })
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const body = typeof init?.body === 'string' ? init.body : undefined
    const auth = (init?.headers as Record<string, string> | undefined)?.authorization
    calls.push({ url, body, auth })
    if (url === `${ISSUER}/.well-known/oauth-protected-resource/fo`) return json(200, { resource: RESOURCE, authorization_servers: [ISSUER] })
    if (url === `${ISSUER}/.well-known/oauth-authorization-server`)
      return json(200, { issuer: ISSUER, authorization_endpoint: `${ISSUER}/oauth/authorize`, token_endpoint: `${ISSUER}/oauth/token`, registration_endpoint: `${ISSUER}/oauth/register`, code_challenge_methods_supported: ['S256'] })
    if (url === `${ISSUER}/oauth/register`) return json(201, { client_id: 'client-123' })
    if (url === `${ISSUER}/oauth/token`) {
      const p = new URLSearchParams(body)
      if (p.get('grant_type') === 'authorization_code' && p.get('code') !== 'good-code') return json(400, { error: 'invalid_grant' })
      if (p.get('grant_type') === 'refresh_token' && p.get('refresh_token') !== 'refresh-secret') return json(400, { error: 'invalid_grant' })
      const access = `access-secret-${++tokenN}`
      accessValid = new Set([access])
      return json(200, { access_token: access, token_type: 'Bearer', expires_in: 3600, refresh_token: 'refresh-secret' })
    }
    if (url === RESOURCE) {
      if (!auth || !accessValid.has(auth.replace('Bearer ', ''))) return json(401, { error: 'missing api key' })
      const rpc = JSON.parse(body!)
      const result = rpc.method === 'initialize' ? { protocolVersion: '2025-06-18' } : { structuredContent: { status: 'working', conversationId: 'conv-1', progress: 'on it' } }
      return json(200, `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result })}\n\n`, 'text/event-stream')
    }
    return json(404, {})
  }) as typeof fetch
  return { f, calls, revoke: () => (accessValid = new Set()) }
}

function setup() {
  const wajo = fakeWajo()
  const clock = { t: 5_000_000 }
  const store = Store.memory()
  const oauth = new FoOAuth({ store, sealer: new Sealer('x'.repeat(40)), resource: RESOURCE, redirectUri: 'http://localhost:8787/api/fo/callback', fetch: wajo.f, now: () => clock.t })
  return { wajo, clock, store, oauth }
}

test('start: registers once, sends S256 PKCE, a fresh state, and the resource indicator', async () => {
  const { oauth, store, wajo } = setup()
  const url = new URL(await oauth.start('u1'))
  const p = url.searchParams
  assert.equal(url.origin + url.pathname, `${ISSUER}/oauth/authorize`)
  assert.equal(p.get('client_id'), 'client-123')
  assert.equal(p.get('code_challenge_method'), 'S256')
  assert.equal(p.get('resource'), RESOURCE)
  const pending = store.data.pendingAuth[p.get('state')!]
  assert.equal(pending.userId, 'u1')
  const expected = createHash('sha256').update(pending.verifier).digest('base64url')
  assert.equal(p.get('code_challenge'), expected)
  assert.ok(!url.toString().includes(pending.verifier), 'verifier never leaves the server')
  await oauth.start('u1')
  assert.equal(wajo.calls.filter((c) => c.url.endsWith('/oauth/register')).length, 1)
})

test('finish: state must exist, belong to the session, be fresh, and is single-use', async () => {
  const { oauth, clock } = setup()
  const state = (u: string) => oauth.start(u).then((s) => new URL(s).searchParams.get('state')!)
  const reject = (p: Promise<unknown>, code: string) => assert.rejects(p, (e: unknown) => e instanceof OAuthError && e.code === code)

  await reject(oauth.finish('u1', 'good-code', 'made-up'), 'state')
  const other = await state('u2')
  await reject(oauth.finish('u1', 'good-code', other), 'state')
  await reject(oauth.finish('u2', 'good-code', other), 'state') // consumed by the failed attempt
  const old = await state('u1')
  clock.t += 11 * 60_000
  await reject(oauth.finish('u1', 'good-code', old), 'state')
  const bad = await state('u1')
  await reject(oauth.finish('u1', 'wrong-code', bad), 'token')
  assert.equal(oauth.connected('u1'), false)

  const good = await state('u1')
  await oauth.finish('u1', 'good-code', good)
  assert.equal(oauth.connected('u1'), true)
  await reject(oauth.finish('u1', 'good-code', good), 'state')
})

test('tokens are sealed at rest and the code exchange sends the PKCE verifier', async () => {
  const { oauth, store, wajo } = setup()
  const st = new URL(await oauth.start('u1')).searchParams.get('state')!
  const verifier = store.data.pendingAuth[st].verifier
  await oauth.finish('u1', 'good-code', st)
  const exchange = new URLSearchParams(wajo.calls.find((c) => c.url.endsWith('/oauth/token'))!.body)
  assert.equal(exchange.get('code_verifier'), verifier)
  assert.equal(exchange.get('client_id'), 'client-123')
  const disk = JSON.stringify(store.data)
  assert.ok(!disk.includes('access-secret') && !disk.includes('refresh-secret'), 'no plaintext tokens in storage')
})

test('expiring tokens are refreshed; a 401 refreshes once and retries', async () => {
  const { oauth, clock, wajo } = setup()
  const st = new URL(await oauth.start('u1')).searchParams.get('state')!
  await oauth.finish('u1', 'good-code', st)
  assert.equal(await oauth.accessToken('u1'), 'access-secret-1')
  clock.t += 3600_000
  assert.equal(await oauth.accessToken('u1'), 'access-secret-2')

  const fo = new LiveFoAdapter(oauth, new McpClient(RESOURCE, { fetch: wajo.f }))
  wajo.revoke() // server-side revocation of the current access token
  const r = await fo.ask('u1', { message: 'hi', newConversation: true })
  assert.equal(r.conversationId, 'conv-1')
  const mcpCalls = wajo.calls.filter((c) => c.url === RESOURCE)
  assert.ok(mcpCalls.some((c) => c.auth === 'Bearer access-secret-3'))
})

test('a failed refresh disconnects instead of looping', async () => {
  const { oauth, clock, store } = setup()
  const st = new URL(await oauth.start('u1')).searchParams.get('state')!
  await oauth.finish('u1', 'good-code', st)
  const sealer = new Sealer('x'.repeat(40))
  store.data.tokens.u1 = sealer.seal(JSON.stringify({ accessToken: 'old', refreshToken: 'revoked', expiresAt: clock.t - 1 }))
  await assert.rejects(oauth.accessToken('u1'))
  assert.equal(oauth.connected('u1'), false)
})
