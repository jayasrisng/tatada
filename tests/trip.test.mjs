import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
const require = createRequire(join(process.env.TATADA_TEST_BUILD, 'package.json'))
const { reducer } = require('./state/reducer.js')
const { seed } = require('./data/seed.js')
const { think } = require('./magic/engine.js')
const { fmtDay } = require('./magic/dates.js')

const LISBON_WORDS = /Lisbon|Casa do Largo|CDL-|Nov 7|reservas@|Horta/
const profile = { name: 'Mei', homeAirport: 'SFO', style: [], diet: [], memberships: [] }
const state = () => structuredClone(seed())
const kyotoTrip = () => ({
  id: 'kyoto-2027', destination: 'Kyoto', country: 'Japan', start: '2027-03-18', end: '2027-03-22',
  travelers: 3, companions: 'with friends', budget: 4000, vibe: [], constraints: [], discounts: [],
  status: 'planning', tint: 'blue', summary: {}, options: [], memories: [],
  bookings: [{ id: 'k1', kind: 'stay', title: 'Gion Machiya House', when: '', ref: 'GMH-77', detail: '', simulated: false,
    checkIn: '2027-03-18', checkOut: '2027-03-22', contact: 'stay@gion-machiya.example' }],
  arrival: '2027-03-18T09:15',
})
const asAction = (reply, id = 'a1') => ({ ...reply.action, id, mode: 'simulated', status: 'proposed', cursor: 0, log: [], answers: [], createdAt: 0 })
const run = (s, id = 'a1') => {
  s = reducer(s, { type: 'approve', id, script: s.actions.find((a) => a.id === id).script })
  for (let i = 0; i < 10; i++) s = reducer(s, { type: 'tick', id })
  return s
}

test('a non-Lisbon trip gets an email built only from its own booking and profile', () => {
  const trip = kyotoTrip()
  const reply = think('Ask my stay for early check-in', trip, undefined, { profile })
  assert.ok(reply.action, 'drafts an action when nothing is missing')
  const e = reply.action.email
  assert.equal(e.to, 'stay@gion-machiya.example')
  assert.equal(e.toName, 'Gion Machiya House')
  assert.match(e.body, /3 guests/)
  assert.match(e.body, new RegExp(fmtDay('2027-03-18')))
  assert.match(e.body, /9:15am/)
  assert.match(e.body, /Mei$/)
  assert.match(e.subject, /GMH-77/)
  assert.doesNotMatch(JSON.stringify(reply), LISBON_WORDS)
  assert.equal(e.transferQuote, false)
})

test('missing contact and arrival details are asked for, never invented', () => {
  const s = state()
  const bigSur = s.trips.find((t) => t.id === 'bigsur')
  const reply = think('early check-in please', bigSur, undefined, { profile })
  assert.equal(reply.action, undefined)
  assert.ok(reply.form)
  assert.deepEqual(reply.form.fields.filter((f) => f.required).map((f) => f.key), ['hotelName', 'hotelEmail', 'checkIn', 'arrivalTime'])
  assert.doesNotMatch(JSON.stringify(reply), /@|LISBON|Casa/)

  const kyoto = kyotoTrip()
  delete kyoto.arrival
  const onlyTime = think('early check-in', kyoto, undefined, { profile })
  assert.deepEqual(onlyTime.form.fields.map((f) => f.key), ['arrivalTime'])
})

test('supplied details are saved to the trip, then used for the draft', () => {
  let s = state()
  s = reducer(s, { type: 'saveStayDetails', tripId: 'bigsur', details: { hotelName: 'Creekside Cabins', hotelEmail: 'hi@creekside.example', checkIn: '2026-12-12', arrivalTime: '16:00' } })
  const trip = s.trips.find((t) => t.id === 'bigsur')
  assert.equal(trip.bookings.find((b) => b.kind === 'stay').contact, 'hi@creekside.example')
  assert.equal(trip.arrival, '2026-12-12T16:00')
  const reply = think('early check-in', trip, undefined, { profile })
  assert.equal(reply.action.email.to, 'hi@creekside.example')
  assert.match(reply.action.email.body, /Sat, Dec 12/)
  assert.match(reply.action.email.body, /4 guests/)
  // Lisbon is untouched.
  assert.deepEqual(s.trips.find((t) => t.id === 'lisbon'), state().trips.find((t) => t.id === 'lisbon'))
})

test('an invalid check-in date outside the trip is asked for again', () => {
  const trip = kyotoTrip()
  trip.bookings[0].checkIn = '2027-04-01'
  const reply = think('early check-in', trip, undefined, { profile })
  assert.ok(reply.form.fields.some((f) => f.key === 'checkIn'))
})

test('a transfer quote never becomes a transfer booking or completes the task', () => {
  let s = state()
  const item = s.items.find((i) => i.text.startsWith('Early check-in'))
  const lisbon = s.trips.find((t) => t.id === 'lisbon')
  const reply = think('Email Casa do Largo to ask for early check-in and an airport transfer quote', lisbon, item.id, { profile, items: s.items })
  assert.equal(reply.action.email.transferQuote, true)
  assert.match(reply.action.email.body, /quote for now, not booking/)
  s.actions = [asAction(reply)]
  const before = lisbon.bookings.length
  s = run(s)
  const after = s.trips.find((t) => t.id === 'lisbon')
  assert.equal(s.actions[0].status, 'verified')
  assert.equal(after.bookings.length, before)
  assert.ok(!after.bookings.some((b) => b.kind === 'transfer'))
  const updated = s.items.find((i) => i.id === item.id)
  assert.equal(updated.done, false)
  assert.match(updated.note, /not booked/)
})

test('switching trip context never completes another trip\'s task', () => {
  let s = state()
  const lisbonItem = s.items.find((i) => i.tripId === 'lisbon' && !i.done)
  const kyoto = kyotoTrip()
  s.trips.push(kyoto)
  const reply = think('early check-in', kyoto, lisbonItem.id, { profile, items: s.items })
  assert.equal(reply.action.checklistItemId, undefined)

  // Even a stale link in saved state is ignored by the reducer.
  s.actions = [{ ...asAction(reply), checklistItemId: lisbonItem.id }]
  s = run(s)
  assert.equal(s.items.find((i) => i.id === lisbonItem.id).done, false)
  const blocked = reducer(s, { type: 'applyServerOutcome', tripId: 'kyoto-2027', itemId: lisbonItem.id, actionId: 'x', done: true, note: 'n' })
  assert.deepEqual(blocked.items, s.items)
})

test('asking for packing help twice does not duplicate checklist items', () => {
  let s = state()
  const bigSur = s.trips.find((t) => t.id === 'bigsur')
  const first = think('what should I pack?', bigSur, undefined, { items: s.items })
  assert.ok(first.addItems.length > 0)
  const items = first.addItems.map((i, n) => ({ ...i, id: `p${n}` }))
  s = reducer(s, { type: 'chat', messages: [], items })
  const count = s.items.length
  const second = think('what should I pack?', bigSur, undefined, { items: s.items })
  assert.equal(second.addItems.length, 0)
  assert.match(second.text, /already on your list/)
  // The reducer also refuses duplicates if a stale reply is replayed.
  s = reducer(s, { type: 'chat', messages: [], items: items.map((i) => ({ ...i, id: i.id + 'b', text: i.text.toUpperCase() })) })
  assert.equal(s.items.length, count)
})

test('a delay shifts the known arrival time, and asks when it would cross midnight', () => {
  const trip = kyotoTrip()
  const reply = think('my flight is delayed 3 hours', trip, undefined, { profile })
  assert.match(reply.action.email.body, /12:15pm/)
  trip.arrival = '2027-03-18T22:30'
  const late = think('my flight is delayed 3 hours', trip, undefined, { profile })
  assert.equal(late.action, undefined)
  assert.equal(late.form.fields.find((f) => f.key === 'arrivalTime').label, 'New arrival time')
})

test('restaurant calls are a Lisbon-only demo; other trips get an honest answer', () => {
  const reply = think('book a dinner table', kyotoTrip(), undefined, { profile })
  assert.equal(reply.action, undefined)
  assert.doesNotMatch(reply.text, LISBON_WORDS)
})

test('seed weekday labels match their dates', () => {
  for (const trip of seed().trips) {
    for (const b of trip.bookings) {
      const iso = b.at?.slice(0, 10) ?? b.checkIn
      if (!iso) continue
      assert.ok(b.when.startsWith(fmtDay(iso)), `${trip.id}/${b.id}: "${b.when}" should start with ${fmtDay(iso)}`)
    }
  }
  const dinner = think('book dinner', seed().trips.find((t) => t.id === 'lisbon'), undefined, { profile })
  assert.match(dinner.action.script, /Saturday, Nov 7/)
  assert.equal(fmtDay('2026-11-07'), 'Sat, Nov 7')
})
