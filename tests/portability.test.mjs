import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
const require = createRequire(join(process.env.TATADA_TEST_BUILD, 'package.json'))
const { seed, emptyState } = require('./data/seed.js')
const { reducer } = require('./state/reducer.js')
const { think } = require('./magic/engine.js')
const { isAppState, loadState, accountKey } = require('./state/persistence.js')
const { buildExport, parseImport, EXPORT_VERSION } = require('./state/portability.js')

const serverAction = {
  id: 'srv-1', provider: 'live', status: 'verified', foMessage: 'x', contentHash: 'h', ref: 'T-1',
  draft: { intent: 'early_checkin', to: 'me@example.com', toName: 'Test Stay', tripId: 'lisbon', subject: 's', body: 'b', transferQuote: false, shared: [] },
  progress: [{ at: 1, text: 'You approved this exact message' }],
  result: { outcome: 'request_sent', summary: 'Sent.', evidence: [{ kind: 'email_sent', detail: 'Sent to me@example.com', messageId: '<id@x>' }], itemDone: false, itemNote: 'n' },
  answers: [],
}
const withLocalAction = () => {
  const s = structuredClone(seed())
  const reply = think('book dinner', s.trips.find((t) => t.id === 'lisbon'))
  s.actions = [{ ...reply.action, id: 'loc-1', mode: 'simulated', status: 'proposed', cursor: 0, log: [], answers: [], createdAt: 0 }]
  s.chat = [{ id: 'c1', from: 'tatada', text: 'hi', actionId: 'loc-1', serverActionId: 'srv-1' }]
  return s
}

test('export → import round-trips trips, tasks, memories, decisions and Magic history', () => {
  const s = withLocalAction()
  const file = JSON.stringify(buildExport(s, [serverAction], new Date('2026-10-17T12:00:00Z')))
  const r = parseImport(file)
  assert.equal(r.ok, true)
  const j = (v) => JSON.parse(JSON.stringify(v))
  assert.deepEqual(r.state.trips, j(s.trips))
  assert.deepEqual(r.state.items, j(s.items))
  assert.deepEqual(r.state.decisions, j(s.decisions))
  assert.deepEqual(r.state.profile, j(s.profile))
  assert.equal(r.state.chat[0].text, 'hi')
  assert.equal(isAppState(r.state), true)
})

test('imported requests become read-only history and can never run again', () => {
  const r = parseImport(JSON.stringify(buildExport(withLocalAction(), [serverAction])))
  assert.deepEqual(r.state.actions, [], 'no executable actions after import')
  assert.equal(r.state.chat[0].actionId, undefined)
  assert.equal(r.state.chat[0].serverActionId, undefined)
  const ids = r.state.archivedActions.map((a) => a.id).sort()
  assert.deepEqual(ids, ['loc-1', 'srv-1'])
  const live = r.state.archivedActions.find((a) => a.id === 'srv-1')
  assert.equal(live.provider, 'live')
  assert.match(live.evidence[0], /email_sent/)
  // The reducer can't tick or approve archived entries: they aren't actions.
  assert.deepEqual(reducer(r.state, { type: 'tick', id: 'loc-1' }), r.state)
})

test('exports carry no credentials or server-internal fields', () => {
  const s = withLocalAction()
  s.secretToken = 'should-not-export'
  const text = JSON.stringify(buildExport(s, [{ ...serverAction, accessToken: 'tok', ownerId: 'u' }]))
  assert.doesNotMatch(text, /should-not-export|accessToken|"tok"|ownerId|refresh_token|access_token/)
  assert.equal(JSON.parse(text).version, EXPORT_VERSION)
})

test('imports are validated: wrong format, future version, damage, and size are refused', () => {
  const good = buildExport(seed(), [])
  assert.match(parseImport('{nope').error, /valid JSON/)
  assert.match(parseImport(JSON.stringify({ hello: 1 })).error, /isn't a Tatada export/)
  assert.match(parseImport(JSON.stringify({ ...good, version: EXPORT_VERSION + 1 })).error, /newer Tatada/)
  assert.match(parseImport(JSON.stringify({ ...good, version: 'x' })).error, /no valid version/)
  const broken = structuredClone(good)
  broken.state.trips[0].bookings = 'oops'
  assert.match(parseImport(JSON.stringify(broken)).error, /damaged/)
  assert.match(parseImport(JSON.stringify({ ...good, actionHistory: [{ id: 1 }] })).error, /damaged/)
  assert.match(parseImport('x'.repeat(5 * 1024 * 1024 + 1)).error, /too large/)
})

test('a raw recovery copy (version 0) imports', () => {
  const r = parseImport(JSON.stringify(seed()))
  assert.equal(r.ok, true)
  assert.equal(r.state.trips.length, seed().trips.length)
})

test('accounts on a shared browser keep separate local data; real accounts start empty', () => {
  const data = new Map()
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }
  data.set(accountKey('a'), JSON.stringify(seed()))
  assert.equal(loadState(() => storage, accountKey('a'), emptyState).state.trips.length, 3)
  const fresh = loadState(() => storage, accountKey('b'), emptyState).state
  assert.equal(fresh.trips.length, 0)
  assert.equal(fresh.onboarded, false)
  assert.equal(isAppState(fresh), true)
  // A corrupted account copy is set aside under that account's own recovery key.
  data.set(accountKey('b'), '{bad')
  const rec = loadState(() => storage, accountKey('b'), emptyState)
  assert.ok(rec.warning)
  assert.equal(data.get(`${accountKey('b')}:recovery`), '{bad')
})

test('closet photos, kept outfits and itinerary survive export and restore', () => {
  let s = structuredClone(seed())
  s = reducer(s, { type: 'addGarment', garment: { id: 'camera-top', name: 'My top', category: 'top', color: '#abcdef', vibe: ['casual'], image: 'data:image/png;base64,AAAA', isolated: true, source: 'camera', addedAt: 1 } })
  s = reducer(s, { type: 'swipeLook', look: { id: 'saved-look', tripId: 'lisbon', garmentIds: ['camera-top', 'straight-jeans'], day: '2026-11-08', verdict: 'keep', at: 2 } })
  const restored = parseImport(JSON.stringify(buildExport(s, [])))
  assert.equal(restored.ok, true)
  assert.deepEqual(restored.state.wardrobe, s.wardrobe)
  assert.deepEqual(restored.state.looks, s.looks)
  assert.deepEqual(restored.state.trips[0].itinerary, s.trips[0].itinerary)
})
