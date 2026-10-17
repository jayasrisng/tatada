import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp } from '../app.ts'
import { draft, setup } from './helpers.ts'

async function boot() {
  const s = setup()
  const handle = createApp({ store: s.store, actions: s.service, appUrl: 'http://app.test', secureCookies: false })
  const server: Server = createServer((req, res) => void handle(req, res))
  await new Promise<void>((r) => server.listen(0, r))
  const base = `http://localhost:${(server.address() as AddressInfo).port}`
  const client = () => {
    let cookie = ''
    return async (path: string, init: RequestInit & { json?: unknown; csrf?: boolean } = {}) => {
      const headers: Record<string, string> = { ...(cookie && { cookie }), ...(init.csrf !== false && init.method && init.method !== 'GET' && { 'x-tatada': '1' }) }
      if (init.json !== undefined) headers['content-type'] = 'application/json'
      const res = await fetch(base + path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : undefined, redirect: 'manual' })
      const set = res.headers.get('set-cookie')
      if (set) cookie = set.split(';')[0]
      const body: any = await res.json().catch(() => null)
      return { status: res.status, body, headers: res.headers }
    }
  }
  return { s, server, client }
}

test('sessions, CSRF header, and ownership are enforced over HTTP', async () => {
  const { server, client } = await boot()
  try {
    const alice = client()
    const mallory = client()
    assert.equal((await alice('/api/actions')).status, 401)
    const sess = await alice('/api/session', { method: 'POST' })
    assert.equal(sess.status, 200)
    assert.match(sess.headers.get('set-cookie')!, /HttpOnly; SameSite=Lax/)
    await mallory('/api/session', { method: 'POST' })

    assert.equal((await alice('/api/actions', { method: 'POST', json: draft(), csrf: false })).status, 403)
    const created = await alice('/api/actions', { method: 'POST', json: draft() })
    assert.equal(created.status, 201)
    const id = created.body.action.id
    assert.equal(created.body.action.ownerId, undefined, 'owner id is not exposed')

    assert.equal((await mallory(`/api/actions/${id}`)).status, 404)
    assert.equal((await mallory(`/api/actions/${id}/approve`, { method: 'POST', json: { contentHash: created.body.action.contentHash, idempotencyKey: 'k-12345678' } })).status, 404)
    assert.deepEqual((await mallory('/api/actions')).body.actions, [])

    const stale = await alice(`/api/actions/${id}/approve`, { method: 'POST', json: { contentHash: 'nope', idempotencyKey: 'k-12345678' } })
    assert.equal(stale.status, 409)
    const ok = await alice(`/api/actions/${id}/approve`, { method: 'POST', json: { contentHash: created.body.action.contentHash, idempotencyKey: 'k-12345678' } })
    assert.equal(ok.body.action.status, 'approved')
    const reload = await alice(`/api/actions?ids=${id}`)
    assert.equal(reload.body.actions[0].status, 'approved', 'state survives a page reload')
  } finally {
    server.close()
  }
})

test('mock mode refuses to start OAuth and never returns provider tokens', async () => {
  const { server, client, s } = await boot()
  try {
    const c = client()
    await c('/api/session', { method: 'POST' })
    assert.equal((await c('/api/fo/connect')).status, 409)
    const st = await c('/api/status')
    assert.deepEqual(Object.keys(st.body).sort(), ['foConnected', 'liveRecipients', 'provider'])
    assert.equal(st.body.provider, 'mock')
    assert.equal(JSON.stringify(s.store.data).includes('accessToken'), false)
  } finally {
    server.close()
  }
})
