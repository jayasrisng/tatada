import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
const require = createRequire(join(process.env.TATADA_TEST_BUILD, 'package.json'))
const { rankPlaces, safeWebsite, eventLinks, discoveryIntent, NO_PREFERENCES, describeOpen } = require('./discovery/places.js')
const { parseOpeningHours, openStatus } = require('./discovery/hours.js')
const { formatEventTime, formatPrice, eventSaveText, eventPlaceLine, sourceSummary, checkedLine } = require('./discovery/eventFormat.js')
const { reliableZone, venueTime } = require('./discovery/zone.js')
const { seed } = require('./data/seed.js')
const { reducer } = require('./state/reducer.js')
const { buildExport, parseImport } = require('./state/portability.js')

const origin = { lat: 37.78, lon: -122.4 }
// ~88 m per 0.001° of longitude at this latitude.
const at = (meters) => origin.lon + meters / 88000
const place = (id, meters, tags = {}, amenity = 'cafe') => ({ type: 'node', id, lat: origin.lat, lon: at(meters), tags: { name: `Place ${id}`, amenity, ...tags } })
const prefs = (p) => ({ ...NO_PREFERENCES, ...p })

test('requests become explicit preferences', () => {
  const coffee = discoveryIntent('Find coffee near me with good parking and a nice view')
  assert.equal(coffee.kind, 'coffee'); assert.equal(coffee.prefs.parking, true); assert.equal(coffee.prefs.views, true); assert.equal(coffee.asksRatings, false)
  const veg = discoveryIntent('Find a vegetarian restaurant I would actually enjoy')
  assert.equal(veg.kind, 'restaurants'); assert.equal(veg.prefs.vegetarian, true); assert.equal(veg.asksRatings, true)
  const walk = discoveryIntent('Find somewhere close enough to walk', NO_PREFERENCES, 'restaurants')
  assert.equal(walk.kind, 'restaurants', 'keeps the selected kind'); assert.equal(walk.prefs.walk, true)
  assert.equal(discoveryIntent("coffee, don't need parking", prefs({ parking: true })).prefs.parking, false)
  assert.equal(discoveryIntent('coffee near the park').prefs.parking, false)
  assert.equal(discoveryIntent('thai dinner').prefs.cuisine, 'thai')
  const ev = discoveryIntent('free jazz concerts this weekend')
  assert.equal(ev.kind, 'events'); assert.equal(ev.when, 'weekend'); assert.equal(ev.freeOnly, true)
  assert.equal(discoveryIntent('things to do tonight').when, 'today')
  assert.equal(discoveryIntent('vegan dinner nearby').kind, 'restaurants')
  assert.equal(discoveryIntent('concerts this week').kind, 'events')
})

test('parking and views: nearby lots/viewpoints are context, not venue features', () => {
  const elements = [
    place(1, 600, { name: 'Skyline Rooftop Cafe' }),
    place(2, 100),
    place(3, -250),
    { type: 'way', id: 10, center: { lat: origin.lat, lon: at(180) }, tags: { amenity: 'parking', fee: 'yes' } },
    { type: 'node', id: 11, lat: origin.lat, lon: at(-240), tags: { amenity: 'parking', access: 'private' } },
    { type: 'node', id: 12, lat: origin.lat, lon: at(160), tags: { tourism: 'viewpoint' } },
  ]
  const results = rankPlaces(elements, origin, 'coffee', prefs({ parking: true, views: true }))
  const byId = Object.fromEntries(results.map((r) => [r.id, r]))
  assert.deepEqual(results.map((r) => r.id), ['node/2', 'node/1', 'node/3'], 'a view word in a name is only a weak hint')
  assert.equal(results.at(-1).id, 'node/3', 'a private lot next door does not count')
  assert.ok(byId['node/3'].notes.includes('No parking information mapped nearby.'))
  assert.match(byId['node/2'].reasons.join(' | '), /Public parking mapped 80 m away \(paid\); spaces unknown/)
  assert.match(byId['node/2'].reasons.join(' | '), /Viewpoint mapped 60 m away; view from inside unknown/)
  assert.deepEqual(byId['node/1'].reasons, ['“Skyline” in its name, a hint only; view not confirmed'])
  const tagged = rankPlaces([place(5, 300, { rooftop: 'yes' }), place(6, 300, { name: 'Vista Cafe' })], origin, 'coffee', prefs({ views: true }))
  assert.deepEqual(tagged.map((r) => r.id), ['node/5', 'node/6'], 'a mapped rooftop outranks a name hint')
  for (const r of results.flatMap((x) => x.reasons)) assert.doesNotMatch(r, /has parking|has a view|great view/i)
  assert.equal(results[0].rating, undefined)
})

test('vegetarian: explicit tags rank, explicit "no" excludes, unknown stays unknown', () => {
  const elements = [
    place(1, 900, { 'diet:vegetarian': 'only' }, 'restaurant'),
    place(2, 300, { 'diet:vegetarian': 'yes', cuisine: 'italian;pizza' }, 'restaurant'),
    place(3, 100, { 'diet:vegetarian': 'no' }, 'restaurant'),
    place(4, 50, {}, 'restaurant'),
    place(5, 60, {}, 'cafe'),
  ]
  const results = rankPlaces(elements, origin, 'restaurants', prefs({ vegetarian: true }))
  assert.deepEqual(results.map((r) => r.id), ['node/1', 'node/2', 'node/4'])
  assert.equal(results[0].reasons[0], 'Fully vegetarian (mapped)')
  assert.ok(results[2].notes.includes('Vegetarian options are not listed; check the menu.'))
  assert.deepEqual(rankPlaces(elements, origin, 'restaurants', prefs({ cuisine: 'thai' })).map((r) => r.id).sort(), ['node/1', 'node/3', 'node/4'], 'unknown cuisine kept, known others removed')
  assert.deepEqual(rankPlaces(elements, origin, 'restaurants', prefs({ cuisine: 'pizza' }))[0].reasons, ['Mapped as Pizza'])
})

test('walkable uses real routes when available and never invents walking times', () => {
  const elements = [place(1, 900), place(2, 1100), place(3, 1300), place(4, 400)]
  const routes = new Map([['node/1', { meters: 2000, minutes: 25 }], ['node/2', { meters: 1300, minutes: 16 }]])
  const results = rankPlaces(elements, origin, 'coffee', prefs({ walk: true }), { routes })
  assert.deepEqual(results.map((r) => r.id), ['node/4', 'node/2'], 'long route and far straight-line excluded')
  assert.deepEqual(results[1].walk, { meters: 1300, minutes: 16 })
  assert.equal(results[0].walk, undefined)
  assert.ok(results[0].notes.some((n) => n.includes('straight line; walking route not checked')))
})

test('opening hours: conservative parsing, local open/closed only when time zone is known', () => {
  const h = parseOpeningHours('Mo-Fr 07:00-18:00; Sa,Su 08:00-14:00; PH off')
  assert.equal(h.holidayCaveat, true)
  assert.deepEqual(openStatus(h, 0, 9 * 60), { state: 'open', closesAt: 18 * 60, closesTomorrow: false })
  assert.deepEqual(openStatus(h, 4, 19 * 60), { state: 'closed', opensAt: 8 * 60, inDays: 1 })
  assert.equal(describeOpen(openStatus(h, 4, 19 * 60), 4), 'Closed · opens tomorrow 8 AM')
  const bar = parseOpeningHours('Tu-Sa 18:00-02:00; Mo off')
  assert.deepEqual(openStatus(bar, 2, 60), { state: 'open', closesAt: 120 }, 'after midnight counts the previous evening')
  assert.equal(openStatus(bar, 0, 60).state, 'closed', 'Monday 1 AM is still Sunday night: closed')
  assert.deepEqual(openStatus(parseOpeningHours('24/7'), 3, 100), { state: 'open', allDay: true })
  assert.deepEqual(parseOpeningHours('Mo-Fr 08:00-12:00,13:00-17:00').days[0], [[480, 720], [780, 1020]])
  for (const odd of ['Jan-Mar Mo-Fr 08:00-18:00', 'sunrise-sunset', 'Mo-Fr 08:00+', '"by appointment"', '']) assert.equal(parseOpeningHours(odd), undefined, odd)
  const elements = [place(1, 100, { opening_hours: 'Mo-Su 07:00-10:00' }), place(2, 200, { opening_hours: 'Mo-Su 07:00-22:00' }), place(3, 150)]
  const evening = () => ({ weekday: 2, minute: 19 * 60, zone: 'America/Los_Angeles' })
  const ranked = rankPlaces(elements, origin, 'coffee', prefs({}), { timeAt: evening })
  assert.deepEqual(ranked.map((r) => r.id), ['node/2', 'node/3', 'node/1'])
  assert.equal(ranked[0].openLabel, 'Open until 10 PM')
  assert.ok(ranked[0].notes.includes('Open until 10 PM is based on mapped hours (America/Los Angeles time).'))
  assert.deepEqual(rankPlaces(elements, origin, 'coffee', prefs({ openNow: true }), { timeAt: evening }).map((r) => r.id), ['node/2', 'node/3'])
  const remote = rankPlaces(elements, origin, 'coffee', prefs({}), { timeAt: () => undefined })
  assert.ok(remote.every((r) => r.open === undefined && r.openLabel === undefined), 'no claim without a reliable zone')
  assert.ok(remote.find((r) => r.id === 'node/1').notes.includes('Listed hours: Mo-Su 07:00-10:00'))
  assert.ok(remote.find((r) => r.id === 'node/3').notes.includes('Opening hours are not listed.'))
})

test('venue time zones come from coordinates and are trusted only when consistent', () => {
  const at = new Date('2026-10-17T19:00:00Z')
  assert.equal(reliableZone({ lat: 37.76, lon: -122.41 }, at), 'America/Los_Angeles')
  assert.equal(reliableZone({ lat: 38.72, lon: -9.14 }, at), 'Europe/Lisbon')
  assert.equal(reliableZone({ lat: 37.76, lon: -122.41 }, at, 'America/Los_Angeles'), 'America/Los_Angeles')
  assert.equal(reliableZone({ lat: 37.76, lon: -122.41 }, at, 'Europe/Paris'), undefined, 'device clock disagrees: no claim')
  assert.equal(reliableZone({ lat: 38.88, lon: -7.03 }, at), undefined, 'Spain/Portugal border near Badajoz: offsets differ nearby')
  assert.deepEqual(venueTime({ lat: 38.72, lon: -9.14 }, at), { zone: 'Europe/Lisbon', weekday: 5, minute: 20 * 60 })
})

test('event display keeps the event time zone and distinguishes free from unknown prices', () => {
  const sf = { start: '2026-10-18T02:00:00.000Z', end: '2026-10-18T06:00:00.000Z', timezone: 'America/Los_Angeles' }
  assert.equal(formatEventTime(sf), 'Sat, Oct 17 · 7:00 PM–11:00 PM PDT')
  assert.equal(formatEventTime({ start: '2026-10-18T09:00:00.000Z', timezone: 'Europe/Lisbon' }), 'Sun, Oct 18 · 10:00 AM GMT+1')
  assert.equal(formatEventTime({ start: '2026-10-17T16:00:00.000Z', end: '2026-10-19T04:00:00.000Z', timezone: 'America/Los_Angeles' }), 'Sat, Oct 17 · 9:00 AM PDT – Sun, Oct 18')
  assert.equal(formatEventTime({ start: '2026-10-18T05:00:00.000Z', end: '2026-10-18T09:00:00.000Z', timezone: 'America/Los_Angeles' }), 'Sat, Oct 17 · 10:00 PM–2:00 AM PDT', 'overnight')
  assert.equal(formatPrice({ kind: 'free' }), 'Free')
  assert.equal(formatPrice({ kind: 'unknown' }), 'Price not listed')
  const e = { id: 'luma:1', title: 'Jazz night', ...sf, venue: 'The Chapel', city: 'San Francisco, CA', distanceKm: 0.42, approximateDistance: true, price: { kind: 'unknown' }, sources: [{ source: 'luma', label: 'Luma', url: 'https://luma.com/x' }], reasons: [], tags: [] }
  assert.equal(eventSaveText(e), 'Jazz night · Sat, Oct 17 · 7:00 PM–11:00 PM PDT')
  assert.equal(eventPlaceLine(e), 'The Chapel · San Francisco, CA · about 400 m')
  assert.equal(sourceSummary([{ label: 'Luma', state: 'ok', count: 3 }, { label: 'Partiful', state: 'failed', count: 0 }, { label: 'Eventbrite', state: 'not_covered', count: 0 }]), "Luma 3 · Partiful didn't answer · Eventbrite not available here")
  const now = Date.parse('2026-10-17T19:00:00Z')
  const cached = [{ label: 'Luma', state: 'ok', count: 3, checkedAt: '2026-10-17T18:52:00Z' }, { label: 'Eventbrite', state: 'ok', count: 2, stale: true, checkedAt: '2026-10-17T17:55:00Z' }]
  assert.equal(sourceSummary(cached, now), 'Luma 3 · Eventbrite 2 (from 1 h ago)')
  assert.equal(checkedLine(cached, now), 'Checked 1 h ago')
  assert.equal(checkedLine([cached[0]], now), 'Checked 8 min ago')
})

test('links stay safe', () => {
  assert.equal(safeWebsite('javascript:alert(1)'), undefined)
  assert.ok(eventLinks('San Francisco', 'jazz & dinner').every((l) => new URL(l.url).searchParams.get('q').includes('jazz & dinner')))
})

test('saved places and events use the existing checklist item shape and survive export/import', () => {
  const s = seed()
  // A save made by the previous discovery panel, already in someone's browser.
  const older = { id: 'old', tripId: s.trips[0].id, phase: 'discover', text: 'Check out Fixture Coffee', note: 'https://www.openstreetmap.org/node/1', kind: 'idea', done: false }
  const event = { id: 'ev', tripId: undefined, phase: 'discover', text: 'Jazz night · Sat, Oct 17 · 7:00 PM–11:00 PM PDT', note: 'https://luma.com/x', kind: 'idea', done: false }
  const next = reducer(reducer(s, { type: 'addItem', item: older }), { type: 'addItem', item: event })
  const restored = parseImport(JSON.stringify(buildExport(next, [])))
  assert.equal(restored.ok, true)
  assert.deepEqual(restored.state.items.filter((i) => ['old', 'ev'].includes(i.id)).map((i) => [i.text, i.note, i.tripId]), [[older.text, older.note, older.tripId], [event.text, event.note, undefined]])
  assert.deepEqual(restored.state.trips.map((t) => t.id), s.trips.map((t) => t.id))
})
