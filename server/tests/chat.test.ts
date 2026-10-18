import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Store } from '../store.ts'
import { MockFoAdapter } from '../fo.ts'
import { FoChatService } from '../chat.ts'
import { ActionService, ActionError } from '../actions.ts'
import { createApp, OWNER_ID } from '../app.ts'
import { FoOAuth } from '../oauth.ts'
import { Sealer } from '../crypto.ts'

const OWNER = 'owner'
function setup(store = Store.memory()) {
  const clock = { t: 5_000_000 }
  const fo = new MockFoAdapter(store)
  const chats = new FoChatService({ store, fo, now: () => clock.t, timeoutMs: 60_000, pollWaitSeconds: 0 })
  const settle = async (id: string, steps = 40) => {
    for (let i = 0; i < steps; i++) {
      clock.t += 2500
      await chats.runDue()
      const c = chats.get(OWNER, id)
      if (!['sending', 'send_uncertain', 'working'].includes(c.status)) return c
    }
    return chats.get(OWNER, id)
  }
  const say = (id: string, text: string, opts: { confirm?: string[]; key?: string; context?: string } = {}) => {
    const p = chats.prepare(OWNER, id, { text, context: opts.context })
    return chats.send(OWNER, id, { hash: p.pending!.hash, idempotencyKey: opts.key ?? `k-${Math.random()}`, confirm: opts.confirm ?? p.pending!.risk })
  }
  return { clock, store, fo, chats, settle, say }
}
const status = (fn: () => unknown, code: number) => assert.throws(fn, (e: unknown) => e instanceof ActionError && e.status === code)

test('opening a chat sends nothing to Fo', async () => {
  const s = setup()
  const c = s.chats.create(OWNER, 'lisbon')
  s.chats.prepare(OWNER, c.id, { text: 'What should I pack?' })
  await s.settle(c.id)
  assert.equal(s.fo.sends, 0)
  assert.equal(s.chats.get(OWNER, c.id).turns.length, 0)
})

test('only the exact previewed message is sent, once, and Fo\'s real reply is shown as Fo\'s words', async () => {
  const s = setup()
  const c = s.chats.create(OWNER, 'lisbon')
  const p = s.chats.prepare(OWNER, c.id, { text: 'What should I pack for Lisbon?', context: 'Trip: Lisbon, Nov 6–11, 2 travelers' })
  assert.match(p.pending!.message, /^Trip: Lisbon.*\n\nWhat should I pack for Lisbon\?\n\n\(Tatada ref T-/s)
  assert.deepEqual(p.pending!.risk, [])
  status(() => s.chats.send(OWNER, c.id, { hash: 'tampered', idempotencyKey: 'key-12345678' }), 409)
  const sent = s.chats.send(OWNER, c.id, { hash: p.pending!.hash, idempotencyKey: 'key-12345678' })
  assert.equal(sent.status, 'sending')
  assert.deepEqual(s.chats.send(OWNER, c.id, { hash: p.pending!.hash, idempotencyKey: 'key-12345678' }), sent, 'repeat tap is a no-op')
  status(() => s.chats.prepare(OWNER, c.id, { text: 'another' }), 409)
  const done = await s.settle(c.id)
  assert.equal(s.fo.sends, 1)
  assert.equal(done.status, 'idle')
  assert.ok(done.conversationId)
  const reply = done.turns.at(-1)!
  assert.equal(reply.role, 'fo')
  assert.equal(reply.kind, 'reply')
  assert.match(reply.text, /Mock Fo got it/)
  assert.equal(done.turns[0].delivery, 'delivered')
})

test('follow-ups continue the same Fo conversation, without a new ref', async () => {
  const s = setup()
  const c = s.chats.create(OWNER)
  s.say(c.id, 'Hi Fo')
  const first = await s.settle(c.id)
  const p = s.chats.prepare(OWNER, c.id, { text: 'And what about rain?' })
  assert.equal(p.pending!.message, 'And what about rain?')
  s.chats.send(OWNER, c.id, { hash: p.pending!.hash, idempotencyKey: 'key-follow-1' })
  const second = await s.settle(c.id)
  assert.equal(second.conversationId, first.conversationId)
  assert.equal(s.fo.sends, 1, 'one new conversation; the follow-up is a reply in it')
  assert.equal(second.turns.filter((t) => t.role === 'fo').length, 2)
})

test('payments, bookings, cancellations and third-party messages need separate confirmation', () => {
  const s = setup()
  const c = s.chats.create(OWNER)
  for (const [text, cat] of [['Buy me a train ticket', 'payment'], ['Book a table for two', 'booking'], ['Cancel my hotel', 'cancellation'], ['Email the hotel about late arrival', 'third_party_message']]) {
    const p = s.chats.prepare(OWNER, c.id, { text })
    assert.ok(p.pending!.risk.includes(cat as never), `${text} → ${cat}`)
    status(() => s.chats.send(OWNER, c.id, { hash: p.pending!.hash, idempotencyKey: `k-${cat}-1234`, confirm: [] }), 403)
  }
  const p = s.chats.prepare(OWNER, c.id, { text: 'Book a table for two' })
  assert.equal(s.chats.send(OWNER, c.id, { hash: p.pending!.hash, idempotencyKey: 'k-book-ok-1', confirm: ['booking'] }).status, 'sending')
})

test('Fo\'s questions are shown and never answered automatically; a "yes" inherits the question\'s risk', async () => {
  const s = setup()
  const c = s.chats.create(OWNER)
  s.say(c.id, 'Help me with the hotel [mock:needs]')
  let r = await s.settle(c.id)
  assert.equal(r.status, 'needs_input')
  assert.equal(r.turns.at(-1)!.kind, 'question')
  for (let i = 0; i < 10; i++) (s.clock.t += 5000), await s.chats.runDue()
  assert.equal((await s.fo.conversation(OWNER, r.conversationId!)).filter((m) => m.role === 'user').length, 1)
  const p = s.chats.prepare(OWNER, c.id, { text: 'yes' })
  assert.deepEqual(p.pending!.risk, ['third_party_message'], 'the question was about an email')
  status(() => s.chats.send(OWNER, c.id, { hash: p.pending!.hash, idempotencyKey: 'k-yes-12345' }), 403)
  s.chats.send(OWNER, c.id, { hash: p.pending!.hash, idempotencyKey: 'k-yes-12345', confirm: ['third_party_message'] })
  r = await s.settle(c.id)
  assert.equal(r.status, 'idle')
})

test('uncertain sends are reconciled from Fo\'s records, never resent; unknown ones fail closed', async () => {
  const s = setup()
  const a = s.chats.create(OWNER)
  s.say(a.id, 'Hello [mock:uncertain]')
  const ra = await s.settle(a.id)
  assert.equal(s.fo.sends, 1)
  assert.equal(ra.turns[0].delivery, 'delivered')
  assert.ok(ra.conversationId)

  const b = s.chats.create(OWNER)
  s.say(b.id, 'Hello [mock:lost]')
  const rb = await s.settle(b.id)
  assert.equal(rb.status, 'failed')
  assert.equal(rb.turns[0].delivery, 'failed')
  assert.match(rb.error!, /no record/)
  assert.equal(s.fo.sends, 1, 'nothing resent automatically')
})

test('Fo failures, timeouts and restarts are reported truthfully', async () => {
  const s = setup()
  const f = s.chats.create(OWNER)
  s.say(f.id, 'Do it [mock:fail]')
  const rf = await s.settle(f.id)
  assert.equal(rf.status, 'failed')
  assert.equal(rf.turns.at(-1)!.kind, 'error')

  const t = s.chats.create(OWNER)
  s.say(t.id, 'Slow one [mock:timeout]')
  const rt = await s.settle(t.id, 60)
  assert.equal(rt.status, 'timeout')
  assert.equal(s.chats.check(OWNER, t.id).status, 'working')

  const r = s.chats.create(OWNER)
  s.say(r.id, 'Hello')
  const s2 = setup(Store.memory())
  s2.store.data = structuredClone(s.store.data)
  s2.store.data.foChats![r.id] = { ...(s2.store.data.foChats![r.id] as object), status: 'sending' }
  s2.chats.recover()
  assert.equal(s2.chats.get(OWNER, r.id).status, 'send_uncertain')
})

test('chats belong to their owner', () => {
  const s = setup()
  const c = s.chats.create(OWNER)
  status(() => s.chats.get('someone-else', c.id), 404)
  assert.deepEqual(s.chats.list('someone-else'), [])
})

/* ── single-owner HTTP mode ── */

async function bootOwner(withOAuth = false) {
  const store = Store.memory()
  const fo = new MockFoAdapter(store)
  const actions = new ActionService({ store, fo })
  const chats = new FoChatService({ store, fo, pollWaitSeconds: 0 })
  let oauth: FoOAuth | undefined
  if (withOAuth) {
    Object.defineProperty(fo, 'mode', { value: 'live' })
    Object.defineProperty(fo, 'connected', { value: (u: string) => !!store.data.tokens[u] })
    const I = 'https://wajo.test'
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })
    const f = (async (u: string | URL | Request) => {
      const url = String(u)
      if (url.endsWith('/.well-known/oauth-protected-resource/fo')) return json({ resource: `${I}/fo`, authorization_servers: [I] })
      if (url.endsWith('/.well-known/oauth-authorization-server')) return json({ issuer: I, authorization_endpoint: `${I}/authorize`, token_endpoint: `${I}/token`, registration_endpoint: `${I}/register`, code_challenge_methods_supported: ['S256'] })
      if (url.endsWith('/register')) return json({ client_id: 'c' })
      return json({ access_token: 'secret-a', token_type: 'Bearer', expires_in: 3600, refresh_token: 'secret-r', scope: 'mcp' })
    }) as typeof fetch
    oauth = new FoOAuth({ store, sealer: new Sealer('z'.repeat(40)), resource: `${I}/fo`, redirectUri: 'http://localhost:8787/api/fo/callback', fetch: f })
  }
  const handle = createApp({ store, actions, fo, oauth, chats, appUrl: 'http://localhost:5173', secureCookies: false, owner: { allowedHosts: ['localhost:5173', '127.0.0.1:5173'], allowedOrigins: ['http://localhost:5173'] } })
  const server: Server = createServer((req, res) => void handle(req, res))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as AddressInfo).port
  const call = async (path: string, o: { method?: string; host?: string; origin?: string | null; json?: unknown; cookie?: string } = {}) => {
    const { request } = await import('node:http')
    return new Promise<{ status: number; body: any; headers: Record<string, unknown> }>((resolve, reject) => {
      const headers: Record<string, string> = { host: o.host ?? 'localhost:5173' }
      if (o.method && o.method !== 'GET') headers['x-tatada'] = '1'
      if (o.origin !== null && o.method && o.method !== 'GET') headers.origin = o.origin ?? 'http://localhost:5173'
      if (o.cookie) headers.cookie = o.cookie
      const body = o.json === undefined ? undefined : JSON.stringify(o.json)
      if (body) headers['content-type'] = 'application/json'
      const req = request({ host: '127.0.0.1', port, path, method: o.method ?? 'GET', headers }, (res) => {
        let t = ''
        res.on('data', (c) => (t += c))
        res.on('end', () => resolve({ status: res.statusCode!, body: t ? JSON.parse(t) : null, headers: res.headers }))
      })
      req.on('error', reject)
      req.end(body)
    })
  }
  return { store, server, call }
}

test('single-owner mode: no sign-in, but only this machine\'s app may talk to it', async () => {
  const t = await bootOwner()
  try {
    const s = await t.call('/api/session', { method: 'POST' })
    assert.equal(s.status, 200)
    assert.equal(s.body.authenticated, true)
    assert.equal(s.body.account.kind, 'owner')
    assert.equal(s.body.owner, true)
    assert.equal((await t.call('/api/status', { host: '192.168.1.20:5173' })).status, 403, 'LAN host refused')
    assert.equal((await t.call('/api/status', { host: 'evil.example' })).status, 403, 'DNS rebinding refused')
    assert.equal((await t.call('/api/fo/chats', { method: 'POST', json: {}, origin: 'https://evil.example' })).status, 403)
    assert.equal((await t.call('/api/fo/chats', { method: 'POST', json: {}, origin: null })).status, 403, 'writes need an Origin')
    const created = await t.call('/api/fo/chats', { method: 'POST', json: { tripId: 'lisbon' } })
    assert.equal(created.status, 201)
    const st = await t.call('/api/fo/status')
    assert.equal(st.body.state, 'connected')
    assert.deepEqual(st.body.tools.slice(0, 2), ['ask_fo', 'get_fo_reply'])
  } finally {
    t.server.close()
  }
})

test('single-owner mode: Fo is authorized for the owner without any Wajo identity; status is truthful', async () => {
  const t = await bootOwner(true)
  try {
    assert.equal((await t.call('/api/fo/status')).body.state, 'disconnected')
    const start = await t.call('/api/auth/wajo/start')
    const state = new URL(String(start.headers.location)).searchParams.get('state')
    const cookie = String((start.headers['set-cookie'] as string[])[0]).split(';')[0]
    const cb = await t.call(`/api/fo/callback?code=x&state=${state}`, { host: 'localhost:5173', cookie })
    assert.equal(cb.headers.location, 'http://localhost:5173/#/?fo=connected')
    assert.ok(t.store.data.tokens[OWNER_ID], 'tokens kept, sealed, for the owner')
    assert.ok(!JSON.stringify(t.store.data).includes('secret-a'))
    assert.equal(t.store.data.identityObservations.at(-1)?.source, 'single_owner_local')
    assert.equal((await t.call('/api/fo/status')).body.state, 'connected')
    await t.call('/api/auth/logout', { method: 'POST', json: {} })
    assert.equal((await t.call('/api/fo/status')).body.state, 'disconnected', 'forgetting Fo works')
  } finally {
    t.server.close()
  }
})

test('all live chat messages require explicit broad Fo authorization', () => {
  const store = Store.memory()
  const fo = new MockFoAdapter(store)
  Object.defineProperty(fo, 'mode', { value: 'live' })
  const service = new FoChatService({ store, fo })
  const c = service.create('owner')
  const prepared = service.prepare('owner', c.id, { text: 'What can you help with?' })
  assert.ok(prepared.pending!.risk.includes('fo_authorization'))
  assert.throws(() => service.send('owner', c.id, { hash: prepared.pending!.hash, idempotencyKey: 'live-key-123', confirm: [] }), ActionError)
  assert.equal(service.send('owner', c.id, { hash: prepared.pending!.hash, idempotencyKey: 'live-key-123', confirm: ['fo_authorization'] }).status, 'sending')
})
