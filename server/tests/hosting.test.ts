import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp } from '../app.ts'
import { setup } from './helpers.ts'

const ORIGIN = 'https://jayasrisng.com'
test('split-host API allows only the configured frontend and keeps health public', async () => {
  const s = setup()
  const app = createApp({ store: s.store, actions: s.service, appUrl: `${ORIGIN}/tatada`, secureCookies: true, allowedOrigin: ORIGIN })
  const server = createServer((req, res) => void app(req, res))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    const preflight = await fetch(`${base}/api/session`, { method: 'OPTIONS', headers: { origin: ORIGIN, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,x-tatada' } })
    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers.get('access-control-allow-origin'), ORIGIN)
    assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true')
    for (const origin of ['https://evil.example', `${ORIGIN}.evil.example`]) {
      const blocked = await fetch(`${base}/api/session`, { method: 'POST', headers: { origin, 'x-tatada': '1' } })
      assert.equal(blocked.status, 403)
      assert.equal(blocked.headers.get('access-control-allow-origin'), null)
    }
    assert.equal((await fetch(`${base}/api/session`, { method: 'POST', headers: { 'x-tatada': '1' } })).status, 403)
    const session = await fetch(`${base}/api/session`, { method: 'POST', headers: { origin: ORIGIN, 'x-tatada': '1' } })
    assert.equal(session.status, 200)
    assert.match(session.headers.get('set-cookie')!, /HttpOnly; SameSite=Lax.*Secure/)
    assert.equal((await fetch(`${base}/api/health`)).status, 200)
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())) }
})
