import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
const require = createRequire(join(process.env.TATADA_TEST_BUILD, 'package.json'))
const { seed, WARDROBE } = require('./data/seed.js')
const { reducer } = require('./state/reducer.js')
const { isAppState } = require('./state/persistence.js')
const { generateLooks, packingList, dayCode, tripDays, combos } = require('./style/looks.js')

const lisbon = (s) => s.trips.find((t) => t.id === 'lisbon')
const byId = new Map(WARDROBE.map((g) => [g.id, g]))
const cats = (ids) => ids.map((id) => byId.get(id).category)

test('the closet extracted from the photos is in the seed and valid', () => {
  const s = seed()
  assert.equal(s.wardrobe.length, 13)
  for (const g of s.wardrobe) assert.match(g.image, /^\/wardrobe\/[\w-]+\.jpg$/)
  assert.equal(isAppState(s), true)
})

test('each trip day gets one look that fits its itinerary dress code', () => {
  const s = seed()
  const t = lisbon(s)
  assert.equal(dayCode(t, '2026-11-07'), 'dressy', 'Saturday dinner is dressy')
  assert.equal(dayCode(t, '2026-11-09'), 'active')
  assert.equal(dayCode(t, '2026-11-10'), 'cold')
  const looks = generateLooks(s.wardrobe, t)
  const forDay = (d) => looks.find((l) => l.day === d)
  assert.ok(cats(forDay('2026-11-07').garmentIds).includes('dress'), 'dressy day → a dress')
  assert.ok(!cats(forDay('2026-11-09').garmentIds).includes('dress'), 'active day → no dress')
  assert.ok(cats(forDay('2026-11-10').garmentIds).includes('layer'), 'cold evening → a layer')
  for (const d of tripDays(t)) assert.ok(forDay(d), `a look for ${d}`)
  const keys = looks.map((l) => [...l.garmentIds].sort().join())
  assert.equal(new Set(keys).size, keys.length, 'no repeats')
  for (const l of looks) assert.ok(cats(l.garmentIds).includes('shoes'))
})

test('every combo is a dress or a top with a bottom, never both', () => {
  for (const c of combos(WARDROBE, 'casual')) {
    const k = c.map((g) => g.category)
    assert.ok(k.includes('dress') !== (k.includes('top') && k.includes('bottom')))
  }
})

test('swiped looks leave the deck; one verdict per outfit; the board packs each piece once', () => {
  let s = seed()
  const t = lisbon(s)
  const [a, b] = generateLooks(s.wardrobe, t)
  s = reducer(s, { type: 'swipeLook', look: { id: 'l1', tripId: 'lisbon', garmentIds: a.garmentIds, day: a.day, verdict: 'skip', at: 1 } })
  s = reducer(s, { type: 'swipeLook', look: { id: 'l2', tripId: 'lisbon', garmentIds: [...a.garmentIds].reverse(), day: a.day, verdict: 'keep', at: 2 } })
  assert.equal(s.looks.length, 1, 'the newer verdict replaces the older')
  s = reducer(s, { type: 'swipeLook', look: { id: 'l3', tripId: 'lisbon', garmentIds: b.garmentIds, day: b.day, verdict: 'keep', at: 3 } })
  const next = generateLooks(s.wardrobe, t, s.looks)
  const swiped = new Set([a, b].map((l) => [...l.garmentIds].sort().join()))
  assert.ok(next.every((l) => !swiped.has([...l.garmentIds].sort().join())))
  const { count, groups } = packingList(s.wardrobe, s.looks, 'lisbon')
  assert.equal(count, new Set([...a.garmentIds, ...b.garmentIds]).size)
  assert.equal(Object.values(groups).flat().length, count)
  assert.equal(packingList(s.wardrobe, s.looks, 'bigsur').count, 0, 'looks are per trip')
})

test('removing a garment cleans up looks; camera pieces are added and validated', () => {
  let s = seed()
  s = reducer(s, { type: 'swipeLook', look: { id: 'l1', tripId: 'lisbon', garmentIds: ['red-ruffle-dress'], verdict: 'keep', at: 1 } })
  s = reducer(s, { type: 'deleteGarment', id: 'red-ruffle-dress' })
  assert.equal(s.wardrobe.some((g) => g.id === 'red-ruffle-dress'), false)
  assert.equal(s.looks.length, 0)
  s = reducer(s, { type: 'addGarment', garment: { id: 'cam1', name: 'Striped shirt', category: 'top', color: '#aabbcc', vibe: ['casual'], image: 'data:image/jpeg;base64,AAAA', source: 'camera', addedAt: 1 } })
  assert.equal(isAppState(s), true)
  assert.equal(isAppState({ ...s, wardrobe: [{ id: 'x', name: 'y', category: 'hat' }] }), false)
})

test('itinerary: add, edit, delete, kept in time order, and only inside the trip dates', () => {
  let s = seed()
  const add = (item) => (s = reducer(s, { type: 'saveItinerary', tripId: 'lisbon', item }))
  add({ id: 'n1', day: '2026-11-08', time: '08:00', title: 'Coffee', dress: 'casual' })
  let it = lisbon(s).itinerary
  assert.equal(it[it.findIndex((i) => i.id === 'n1') + 1].id, 'it2', 'sorted by day and time')
  add({ id: 'n1', day: '2026-11-08', time: '08:00', title: 'Coffee and a tram ride', dress: 'active' })
  it = lisbon(s).itinerary
  assert.equal(it.filter((i) => i.id === 'n1').length, 1)
  assert.equal(it.find((i) => i.id === 'n1').title, 'Coffee and a tram ride')
  const before = s
  add({ id: 'n2', day: '2027-01-01', title: 'Outside the trip', dress: 'casual' })
  add({ id: 'n3', day: '2026-11-08', title: '   ', dress: 'casual' })
  assert.deepEqual(s, before)
  s = reducer(s, { type: 'deleteItinerary', tripId: 'lisbon', id: 'n1' })
  assert.equal(lisbon(s).itinerary.some((i) => i.id === 'n1'), false)
  assert.equal(isAppState(s), true)
})
