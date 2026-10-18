// Post-deploy smoke check for the hosted events function. Read-only GETs; no credentials.
//   EVENTS_URL=https://<ref>.supabase.co/functions/v1/tatada-events node scripts/check-events-remote.mjs
import assert from 'node:assert/strict'
const base = (process.env.EVENTS_URL ?? 'https://utmbjcgttsjvdpghiqkf.supabase.co/functions/v1/tatada-events').replace(/\/$/, '')
const origin = process.env.EVENTS_ORIGIN ?? 'https://jayasrisng.com'
const health = await fetch(`${base}/health`)
assert.equal(health.status, 200, `health returned ${health.status}`)
for (const [label, query] of [['San Francisco', 'lat=37.7749&lon=-122.4194&city=San%20Francisco&region=California&cc=US&when=week'], ['Lisbon', 'lat=38.7223&lon=-9.1393&city=Lisbon&country=Portugal&cc=PT&when=week']]) {
  const t = Date.now()
  const r = await fetch(`${base}/search?${query}`, { headers: { origin } })
  assert.equal(r.status, 200, `${label}: ${r.status}`)
  assert.equal(r.headers.get('access-control-allow-origin'), origin, `${label}: CORS for ${origin}`)
  const body = await r.json()
  console.log(`${label} (${Date.now() - t} ms): ${body.events.length} events · ${body.sources.map((s) => `${s.label} ${s.state}${s.note ? ` (${s.note})` : ''}`).join(' · ')}`)
  // Providers may block data-centre IPs; a failed source is reported, not fatal, but at least one must answer.
  assert.ok(body.sources.some((s) => s.state === 'ok'), `${label}: no source answered from the hosted function`)
}
const blocked = await fetch(`${base}/search?lat=1&lon=1`, { headers: { origin: 'https://evil.example' } })
assert.equal(blocked.headers.get('access-control-allow-origin'), null)
assert.equal(blocked.status, 403, 'other origins are refused')
assert.equal((await fetch(`${base}/search?lat=1&lon=1`)).status, 403, 'callers without an Origin are refused')
console.log('Hosted events function OK.')
