import test from 'node:test'
import assert from 'node:assert/strict'
import { createEdgeHandler, type EdgeRepository } from '../edge.ts'
import { Store, type Data } from '../store.ts'

class MemoryRepository implements EdgeRepository {
  state: Partial<Data> = {}
  token?: string
  read = async () => structuredClone(this.state)
  async acquire(token: string) {
    if (this.token) return { busy: true }
    this.token = token
    return { state: structuredClone(this.state) }
  }
  async save(token: string, state: Data) { assert.equal(token, this.token); this.state = structuredClone(state) }
  async release(token: string) { assert.equal(token, this.token); this.token = undefined }
}
const ORIGIN = 'https://jayasrisng.com'
const PUBLIC = 'https://test.supabase.co/functions/v1/tatada-api'

test('edge API persists isolated bearer workspaces without third-party cookies', async () => {
  const repository = new MemoryRepository()
  const tasks: Promise<unknown>[] = []
  const handle = createEdgeHandler({ repository, appUrl: `${ORIGIN}/tatada`, publicUrl: PUBLIC, secret: 'test-secret-'.repeat(4), mode: 'mock', waitUntil: (task) => tasks.push(task) })
  const settle = async () => { while (tasks.length) await tasks.shift() }
  const request = (path: string, init: { method?: string; token?: string; body?: unknown; origin?: string } = {}) => handle(new Request(`${PUBLIC}${path}`, {
    method: init.method ?? 'GET',
    headers: { origin: init.origin ?? ORIGIN, 'x-tatada': '1', ...(init.token ? { authorization: `Bearer ${init.token}` } : {}), 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  }))
  const first = await request('/api/session', { method: 'POST' })
  assert.equal(first.status, 200)
  const session = await first.json() as { sessionToken: string }
  assert.ok(session.sessionToken)
  await settle()
  const state = {onboarded:true,trips:[],items:[],profile:{name:'Test',homeAirport:'',style:[],diet:[],memberships:[]},actions:[],chat:[],canvas:{}}
  const saved = await request('/api/workspace', { method: 'PUT', token: session.sessionToken, body: { baseVersion: 0, state } })
  assert.equal(saved.status, 200)
  await settle()
  const workspace = await request('/api/workspace', { token: session.sessionToken })
  assert.deepEqual((await workspace.json() as { state: unknown }).state, state)
  await settle()
  assert.equal((await request('/api/workspace')).status, 401)
  await settle()
  assert.equal((await request('/api/workspace', { token: session.sessionToken, origin: 'https://evil.example' })).status, 403)
  const logout = await request('/api/auth/logout', { method: 'POST', token: session.sessionToken, body: {} })
  assert.equal(logout.status, 200)
  await settle()
  assert.equal((await request('/api/workspace', { token: session.sessionToken })).status, 401)
  await settle()
})

test('a failed persistence barrier is observable before side effects', async () => {
  const store = new Store(undefined, async () => { throw new Error('database down') })
  store.update((data) => { data.mock.marker = true })
  let sent = false
  await assert.rejects(async () => { await store.flush(); sent = true }, /database down/)
  assert.equal(sent, false)
})
