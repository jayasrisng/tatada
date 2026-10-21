import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp, SESSION_IDLE, SESSION_TTL } from '../app.ts'
import { FoOAuth } from '../oauth.ts'
import { sha256, Sealer } from '../crypto.ts'
import { Store } from '../store.ts'
import { MockFoAdapter } from '../fo.ts'
import { ActionService } from '../actions.ts'
import { fromAccessToken, fromTokenResponse } from '../identity.ts'

const ISSUER = 'https://wajo.test'
const RESOURCE = `${ISSUER}/fo`
const jwt = (claims: object) => ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.')

/** Fake Wajo whose token response can carry an identity field (or not). */
function fakeWajo(identity: () => Record<string, unknown>) {
  let n = 0
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url === `${ISSUER}/.well-known/oauth-protected-resource/fo`) return json(200, { resource: RESOURCE, authorization_servers: [ISSUER] })
    if (url === `${ISSUER}/.well-known/oauth-authorization-server`)
      return json(200, { issuer: ISSUER, authorization_endpoint: `${ISSUER}/authorize`, token_endpoint: `${ISSUER}/token`, registration_endpoint: `${ISSUER}/register`, code_challenge_methods_supported: ['S256'] })
    if (url === `${ISSUER}/register`) return json(201, { client_id: 'tatada-client' })
    if (url === `${ISSUER}/token`) {
      const p = new URLSearchParams(String(init?.body))
      if (p.get('grant_type') === 'authorization_code' && p.get('code') !== 'good') return json(400, { error: 'invalid_grant' })
      return json(200, { access_token: `secret-access-${++n}`, token_type: 'Bearer', expires_in: 3600, refresh_token: `secret-refresh-${n}`, ...identity() })
    }
    return json(404, {})
  }) as typeof fetch
}

async function boot(o: { identity?: () => Record<string, unknown>; bearer?: boolean; browserAccounts?: boolean } = {}) {
  let who: Record<string, unknown> = { user_id: 'wajo-user-1' }
  const clock = { t: 10_000_000 }
  const store = Store.memory()
  const fo = new MockFoAdapter(store)
  Object.defineProperty(fo, 'mode', { value: 'live' })
  const actions = new ActionService({ store, fo, now: () => clock.t })
  const oauth = new FoOAuth({ store, sealer: new Sealer('k'.repeat(40)), resource: RESOURCE, redirectUri: 'http://localhost/api/fo/callback', fetch: fakeWajo(o.identity ?? (() => who)), now: () => clock.t })
  const handle = createApp({
    store, actions, fo, oauth, bearerSessions: o.bearer, browserAccounts: o.browserAccounts, appUrl: 'http://app.test', secureCookies: false, now: () => clock.t,
    resolveIdentity: async ({ body, tokens, issuer }) => ({ identity: fromTokenResponse(body, issuer) ?? fromAccessToken(tokens.accessToken, issuer, clock.t) }),
  })
  const server: Server = createServer((req, res) => void handle(req, res))
  await new Promise<void>((r) => server.listen(0, r))
  const base = `http://localhost:${(server.address() as AddressInfo).port}`

  /** A browser: its own cookie jar. */
  const browser = () => {
    const jar = new Map<string, string>()
    const call = async (path: string, init: RequestInit & { json?: unknown } = {}) => {
      const headers: Record<string, string> = { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...init.headers as Record<string,string> }
      if (init.method && init.method !== 'GET') headers['x-tatada'] = '1'
      if (init.json !== undefined) headers['content-type'] = 'application/json'
      const res = await fetch(base + path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : undefined, redirect: 'manual' })
      for (const c of res.headers.getSetCookie()) {
        const [pair] = c.split(';')
        const [k, v] = pair.split('=')
        if (/Max-Age=0/.test(c)) jar.delete(k)
        else jar.set(k, v)
      }
      const body: any = await res.json().catch(() => null)
      return { status: res.status, body, location: res.headers.get('location') ?? '' }
    }
    /** Continue with Wajo → consent (simulated) → callback. */
    const login = async (code = 'good') => {
      const start = await call('/api/auth/wajo/start')
      const state = new URL(start.location).searchParams.get('state')
      return call(`/api/fo/callback?code=${code}&state=${state}`)
    }
    return { call, login, jar }
  }
  return { store, clock, server, browser, setWho: (w: Record<string, unknown>) => (who = w) }
}

test('live mode has no anonymous accounts: Wajo sign-in is the only way in', async () => {
  const t = await boot()
  try {
    const b = t.browser()
    const s = await b.call('/api/session', { method: 'POST' })
    assert.equal(s.body.authenticated, false)
    assert.equal(b.jar.has('tatada_sid'), false)
    assert.equal((await b.call('/api/actions')).status, 401)
    assert.equal(Object.keys(t.store.data.accounts).length, 0)
  } finally {
    t.server.close()
  }
})

test('Continue with Wajo creates one account per verified Wajo identity; tokens stay server-side, sealed', async () => {
  const t = await boot()
  try {
    const b = t.browser()
    const start = await b.call('/api/auth/wajo/start')
    assert.match(start.location, /^https:\/\/wajo\.test\/authorize\?/)
    assert.ok(b.jar.has('tatada_login'), 'login is bound to this browser')
    const cb = await b.call(`/api/fo/callback?code=good&state=${new URL(start.location).searchParams.get('state')}`)
    assert.equal(cb.location, 'http://app.test/#/?auth=signed_in')
    assert.ok(b.jar.has('tatada_sid') && !b.jar.has('tatada_login'))
    const st = await b.call('/api/status')
    assert.equal(st.body.authenticated, true)
    assert.equal(st.body.account.kind, 'wajo')
    assert.equal(st.body.account.identitySource, 'token_response')
    assert.equal(st.body.foConnected, true)
    const raw = JSON.stringify(t.store.data)
    assert.ok(!raw.includes('secret-access') && !raw.includes('secret-refresh') && !raw.includes('wajo-user-1'), 'no tokens or raw Wajo ids at rest')
    assert.ok(!JSON.stringify(st.body).includes('secret'), 'no tokens in responses')
  } finally {
    t.server.close()
  }
})

test('the same Wajo user on another device gets the same workspace; another Wajo user is isolated', async () => {
  const t = await boot()
  try {
    const phone = t.browser()
    const laptop = t.browser()
    await phone.login()
    const ws = {onboarded:true,profile:{name:'Mei',homeAirport:'',style:[],diet:[],memberships:[]},trips:[],items:[],actions:[],chat:[],canvas:{}}
    assert.equal((await phone.call('/api/workspace', { method: 'PUT', json: { baseVersion: 0, state: ws } })).status, 200)
    await laptop.login()
    assert.deepEqual((await laptop.call('/api/workspace')).body.state, ws)
    // Stale writes are refused, not silently merged.
    assert.equal((await laptop.call('/api/workspace', { method: 'PUT', json: { baseVersion: 0, state: ws } })).status, 409)

    t.setWho({ user_id: 'wajo-user-2' })
    const stranger = t.browser()
    await stranger.login()
    assert.equal((await stranger.call('/api/workspace')).body.state, null)
    assert.equal(Object.keys(t.store.data.accounts).length, 2)
    const action = await phone.call('/api/actions', { method: 'POST', json: { intent: 'early_checkin', tripId: 'kyoto', to: 'a@b.example', toName: 'Stay', subject: 'Hi', body: 'Hello', transferQuote: false, shared: [] } })
    assert.equal((await stranger.call(`/api/actions/${action.body.action.id}`)).status, 404)
  } finally {
    t.server.close()
  }
})

test('no verified Wajo identity: login is refused and nothing is kept', async () => {
  const t = await boot({ identity: () => ({}) })
  try {
    const b = t.browser()
    const cb = await b.login()
    assert.equal(cb.location, 'http://app.test/#/welcome?auth=no_identity')
    assert.equal(b.jar.has('tatada_sid'), false)
    assert.equal(Object.keys(t.store.data.accounts).length, 0)
    assert.equal(Object.keys(t.store.data.tokens).length, 0)
    assert.equal(t.store.data.identityObservations.at(-1)?.source, null)
  } finally {
    t.server.close()
  }
})

test('a login started in one browser cannot be finished in another (login CSRF)', async () => {
  const t = await boot()
  try {
    const victim = t.browser()
    const attacker = t.browser()
    const start = await attacker.call('/api/auth/wajo/start')
    const cb = await victim.call(`/api/fo/callback?code=good&state=${new URL(start.location).searchParams.get('state')}`)
    assert.match(cb.location, /auth=error&reason=state/)
    assert.equal(victim.jar.has('tatada_sid'), false)
    assert.match((await victim.login('bad')).location, /reason=token/)
  } finally {
    t.server.close()
  }
})

test('sessions expire when idle or old, rotate on login, and end on logout', async () => {
  const t = await boot()
  try {
    const b = t.browser()
    await b.login()
    const first = b.jar.get('tatada_sid')
    await b.login()
    assert.notEqual(b.jar.get('tatada_sid'), first, 'session id rotates on every login')
    assert.equal(Object.keys(t.store.data.sessions).length, 1, 'the old session is gone')

    t.clock.t += SESSION_IDLE + 1
    assert.equal((await b.call('/api/status')).status, 401)

    await b.login()
    for (let i = 0; i < 40; i++) {
      t.clock.t += 24 * 3600_000 // active daily, never idle
      if ((await b.call('/api/status')).status === 401) {
        assert.ok(i * 24 * 3600_000 >= SESSION_TTL - 2 * 24 * 3600_000, 'absolute expiry')
        break
      }
    }
    await b.login()
    const other = t.browser()
    await other.login()
    await b.call('/api/auth/logout', { method: 'POST', json: {} })
    assert.equal((await b.call('/api/status')).status, 401)
    assert.equal(Object.keys(t.store.data.tokens).length, 1, 'tokens kept while another session remains')
    await other.call('/api/auth/logout', { method: 'POST', json: { everywhere: true } })
    assert.equal(Object.keys(t.store.data.tokens).length, 0, 'tokens dropped with the last session')
  } finally {
    t.server.close()
  }
})

test('sign-in attempts are rate limited per client', async () => {
  const t = await boot()
  try {
    const b = t.browser()
    for (let i = 0; i < 10; i++) await b.call('/api/auth/wajo/start')
    assert.match((await b.call('/api/auth/wajo/start')).location, /auth=rate_limited/)
  } finally {
    t.server.close()
  }
})

test('identity sources: token fields, Wajo-issued unexpired JWT sub, nothing else', () => {
  assert.equal(fromTokenResponse({ user_id: 'u-123' }, ISSUER)?.subject, 'u-123')
  assert.equal(fromTokenResponse({ access_token: 'x', user_id: '' }, ISSUER), null)
  assert.equal(fromAccessToken(jwt({ iss: ISSUER, sub: 'abc', exp: 99_999_999_999 }), ISSUER, Date.now())?.subject, 'abc')
  assert.equal(fromAccessToken(jwt({ iss: 'https://evil.test', sub: 'abc' }), ISSUER, Date.now()), null)
  assert.equal(fromAccessToken(jwt({ iss: ISSUER, sub: 'abc', exp: 1 }), ISSUER, Date.now()), null)
  assert.equal(fromAccessToken('opaque-token', ISSUER, Date.now()), null)
})


test('hosted sign-in uses a single-use exchange bound to the starting browser', async () => {
  const t = await boot({ bearer: true })
  try {
    const b = t.browser()
    const binding = 'browser-only-secret'
    const start = await b.call(`/api/auth/wajo/start?client_binding=${sha256(binding)}`)
    const state = new URL(start.location).searchParams.get('state')
    const callback = await b.call(`/api/fo/callback?code=good&state=${state}`)
    const code = new URLSearchParams(callback.location.split('?')[1]).get('auth_exchange')
    assert.ok(code)
    assert.equal((await b.call('/api/auth/exchange', { method: 'POST', json: { code, binding: 'another-browser' } })).status, 401)
    const result = await b.call('/api/auth/exchange', { method: 'POST', json: { code, binding } })
    assert.equal(result.status, 200)
    assert.ok(result.body.sessionToken)
    assert.ok(t.store.data.sessions[sha256(result.body.sessionToken)])
    assert.equal((await b.call('/api/auth/exchange', { method: 'POST', json: { code, binding } })).status, 401)
    assert.equal(JSON.stringify(t.store.data).includes(result.body.sessionToken), false)
  } finally { t.server.close() }
})


test('hosted OAuth without a stable identity creates fresh isolated connection sessions', async () => {
  const t = await boot({ identity: () => ({}), browserAccounts: true })
  try {
    const a = t.browser()
    const b = t.browser()
    await a.login()
    await b.login()
    const first = await a.call('/api/session', { method: 'POST' })
    const second = await b.call('/api/session', { method: 'POST' })
    assert.equal(first.body.account.kind, 'connected')
    assert.notEqual(first.body.account.id, second.body.account.id)
    assert.equal(first.body.foConnected, true)
    assert.equal(Object.keys(t.store.data.subjects).length, 0, 'no stable identity is claimed')
  } finally { t.server.close() }
})

test('reconnecting opaque-token Wajo preserves an authenticated workspace but never merges another browser',async()=>{
 const t=await boot({identity:()=>({}),browserAccounts:true})
 try{
  const a=t.browser();await a.login();const before=await a.call('/api/session',{method:'POST'}),id=before.body.account.id
  t.store.data.workspaces[id]={version:1,updatedAt:t.clock.t,state:{marker:'my saved trip'}}
  await a.login();assert.equal((await a.call('/api/session',{method:'POST'})).body.account.id,id)
  assert.deepEqual(t.store.data.workspaces[id].state,{marker:'my saved trip'})
  const b=t.browser();await b.login();assert.notEqual((await b.call('/api/session',{method:'POST'})).body.account.id,id)
 }finally{t.server.close()}
})

test('hosted reconnect ticket requires the existing session and the same browser binding, and is single use',async()=>{
 const t=await boot({identity:()=>({}),browserAccounts:true,bearer:true})
 try{
  const a=t.browser(),binding='hosted-browser-secret',hash=sha256(binding)
  assert.equal((await a.call('/api/auth/wajo/link',{method:'POST',json:{clientBinding:hash}})).status,401)
  const start=await a.call(`/api/auth/wajo/start?client_binding=${hash}`),state=new URL(start.location).searchParams.get('state')
  const callback=await a.call(`/api/fo/callback?code=good&state=${state}`),code=new URLSearchParams(callback.location.split('?')[1]).get('auth_exchange')
  const exchange=await a.call('/api/auth/exchange',{method:'POST',json:{code,binding}}),token=exchange.body.sessionToken,id=t.store.data.sessions[sha256(token)].userId
  const linked=await a.call('/api/auth/wajo/link',{method:'POST',headers:{authorization:`Bearer ${token}`},json:{clientBinding:hash}})
  assert.equal(linked.status,200)
  const wrong=await a.call(`/api/auth/wajo/start?client_binding=${sha256('wrong')}&reconnect=${linked.body.ticket}`);assert.match(wrong.location,/reconnect_expired/)
  const reconnect=await a.call(`/api/auth/wajo/start?client_binding=${hash}&reconnect=${linked.body.ticket}`),restate=new URL(reconnect.location).searchParams.get('state')
  const done=await a.call(`/api/fo/callback?code=good&state=${restate}`),recode=new URLSearchParams(done.location.split('?')[1]).get('auth_exchange')
  const final=await a.call('/api/auth/exchange',{method:'POST',json:{code:recode,binding}})
  assert.equal(t.store.data.sessions[sha256(final.body.sessionToken)].userId,id)
  assert.match((await a.call(`/api/auth/wajo/start?client_binding=${hash}&reconnect=${linked.body.ticket}`)).location,/reconnect_expired/)
 }finally{t.server.close()}
})
