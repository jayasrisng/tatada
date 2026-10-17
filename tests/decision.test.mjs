import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
const require = createRequire(join(process.env.TATADA_TEST_BUILD, 'package.json'))
const { reducer } = require('./state/reducer.js')
const { seed } = require('./data/seed.js')
const { think } = require('./magic/engine.js')
const { decideEarlyCheckin, decisionFor } = require('./magic/decision.js')
const { isAppState } = require('./state/persistence.js')

const profile = { name: 'Mei', homeAirport: 'SFO', style: [], diet: [], memberships: [] }
const lisbon = (s) => s.trips.find((t) => t.id === 'lisbon')
const at = Date.parse('2026-10-17T12:00:00Z')
const validation = (over = {}) => ({ actionId: 'srv-1', provider: 'live', status: 'verified', outcome: 'checkin_confirmed', summary: 'Casa do Largo replied: early check-in works.', evidence: ['Send record: Sent to x (<id@mail>)', 'Reply: "Yes, from noon"'], at, ...over })

test('diverge gathers competing claims with provenance; no numeric confidence anywhere', () => {
  const s = seed()
  const d = decideEarlyCheckin(lisbon(s), decisionFor(s.decisions, 'lisbon'))
  const ids = d.claims.map((c) => c.id)
  assert.ok(ids.includes('possible') && ids.includes('not-possible'), 'the counter-claim is gathered, not ignored')
  for (const c of d.claims) {
    assert.ok(['hypothesis', 'fact', 'outcome'].includes(c.kind))
    assert.ok(c.source.kind && c.source.label)
  }
  assert.equal(d.claims.find((c) => c.id === 'standard').source.kind, 'demo', 'demo data is labeled as demo')
  assert.ok(d.claims.find((c) => c.id === 'standard').source.at, 'facts carry a timestamp')
  assert.doesNotMatch(JSON.stringify(d), /confidence|score|probability|\d+%/i)
  assert.equal(d.verdict, 'ask')
  assert.match(d.rationale, /3h 30m before check-in/)
  assert.ok(d.collisions.some((x) => x.between.includes('possible') && x.between.includes('not-possible') && !x.disqualifier))
})

test('collide: arriving after check-in disqualifies asking, and Magic won\'t draft unless told "anyway"', () => {
  let s = seed()
  s = reducer(s, { type: 'setDecisionInput', tripId: 'lisbon', key: 'standardCheckIn', value: '11:00', at })
  const rec = decisionFor(s.decisions, 'lisbon')
  assert.equal(rec.inputs.standardCheckIn.source, 'you')
  const d = decideEarlyCheckin(lisbon(s), rec)
  assert.equal(d.verdict, 'not_needed')
  assert.ok(d.collisions.some((x) => x.disqualifier))
  const reply = think('ask for early check-in', lisbon(s), undefined, { profile, decision: rec })
  assert.equal(reply.action, undefined)
  assert.match(reply.text, /nothing to ask/)
  assert.ok(think('ask for early check-in anyway', lisbon(s), undefined, { profile, decision: rec }).action)
})

test('a "not offered" policy contradicts the hopeful hypothesis and rules out asking', () => {
  let s = seed()
  s = reducer(s, { type: 'setDecisionInput', tripId: 'lisbon', key: 'policy', value: 'not_offered', at })
  const d = decideEarlyCheckin(lisbon(s), decisionFor(s.decisions, 'lisbon'))
  assert.equal(d.verdict, 'dont_ask')
  assert.equal(d.claims.find((c) => c.id === 'possible').status, 'disqualified')
  assert.ok(d.collisions.some((x) => x.disqualifier && x.between.includes('policy')))
})

test('missing details are named, the guess is labeled a hypothesis, and asking stays possible', () => {
  const s = seed()
  const bigSur = s.trips.find((t) => t.id === 'bigsur')
  const d = decideEarlyCheckin({ ...bigSur, arrival: '2026-12-12T13:00', bookings: [{ id: 'b', kind: 'stay', title: 'Cabin', when: '', ref: '', detail: '', simulated: false, checkIn: '2026-12-12', contact: 'c@cabin.example' }] })
  assert.equal(d.verdict, 'need_info')
  assert.deepEqual(d.missing, ['standardCheckIn'])
  const guess = d.claims.find((c) => c.id === 'standard-guess')
  assert.equal(guess.kind, 'hypothesis')
  assert.equal(guess.source.kind, 'general')
  assert.ok(guess.uncertainty)
})

test('validate: a live verified reply becomes an outcome with evidence and settles the contradiction', () => {
  let s = seed()
  s = reducer(s, { type: 'recordValidation', tripId: 'lisbon', validation: validation() })
  const d = decideEarlyCheckin(lisbon(s), decisionFor(s.decisions, 'lisbon'))
  assert.equal(d.verdict, 'confirmed')
  const outcome = d.claims.find((c) => c.kind === 'outcome')
  assert.equal(outcome.source.kind, 'fo_live')
  assert.equal(outcome.source.at, at)
  assert.equal(outcome.evidence.length, 2)
  assert.equal(d.claims.find((c) => c.id === 'possible').status, 'confirmed')
  assert.equal(d.claims.find((c) => c.id === 'not-possible').status, 'refuted')
  // And Magic won't ask again.
  assert.equal(think('early check-in', lisbon(s), undefined, { profile, decision: decisionFor(s.decisions, 'lisbon') }).action, undefined)
  assert.equal(isAppState(s), true, 'decision records survive save/load validation')
})

test('mock results are labeled as mock and never overwrite a live result', () => {
  let s = seed()
  s = reducer(s, { type: 'recordValidation', tripId: 'lisbon', validation: validation({ provider: 'mock', actionId: 'm1' }) })
  let d = decideEarlyCheckin(lisbon(s), decisionFor(s.decisions, 'lisbon'))
  assert.equal(d.claims.find((c) => c.kind === 'outcome').source.kind, 'fo_mock')
  assert.match(d.rationale, /mock Fo, so it isn't a real reply/)
  s = reducer(s, { type: 'recordValidation', tripId: 'lisbon', validation: validation() })
  const live = structuredClone(s)
  s = reducer(s, { type: 'recordValidation', tripId: 'lisbon', validation: validation({ provider: 'mock', actionId: 'm2', outcome: 'checkin_declined' }) })
  assert.deepEqual(s, live)
})

test('Fo prose without proof stays a disqualified hypothesis, never an outcome', () => {
  let s = seed()
  s = reducer(s, { type: 'recordValidation', tripId: 'lisbon', validation: validation({ status: 'unverified', outcome: undefined, evidence: [], summary: 'Fo says it\'s done, but…' }) })
  const d = decideEarlyCheckin(lisbon(s), decisionFor(s.decisions, 'lisbon'))
  assert.equal(d.claims.some((c) => c.kind === 'outcome'), false)
  const claim = d.claims.find((c) => c.id === 'fo-claim')
  assert.equal(claim.kind, 'hypothesis')
  assert.equal(claim.status, 'disqualified')
  assert.equal(d.verdict, 'ask', 'still unresolved')
})

test('a request delivered but unanswered keeps check-in a hypothesis', () => {
  let s = seed()
  s = reducer(s, { type: 'recordValidation', tripId: 'lisbon', validation: validation({ outcome: 'request_sent', summary: 'Your request reached Casa do Largo\'s inbox. No reply yet.', evidence: ['Send record: Sent to x'] }) })
  const d = decideEarlyCheckin(lisbon(s), decisionFor(s.decisions, 'lisbon'))
  assert.equal(d.verdict, 'awaiting_reply')
  assert.equal(d.claims.find((c) => c.id === 'possible').status, 'open')
})

test('decision inputs only attach to an existing trip', () => {
  const s = seed()
  assert.deepEqual(reducer(s, { type: 'setDecisionInput', tripId: 'nope', key: 'policy', value: 'not_offered', at }), s)
})
