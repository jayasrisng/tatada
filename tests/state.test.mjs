import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
const require = createRequire(join(process.env.TATADA_TEST_BUILD, 'package.json'))
const { reducer } = require('./state/reducer.js')
const { seed } = require('./data/seed.js')
const { think } = require('./magic/engine.js')
const { loadState, saveState, isAppState, STORAGE_KEY, RECOVERY_KEY } = require('./state/persistence.js')

function fixture() {
  const state = structuredClone(seed())
  const reply = think('book dinner', state.trips.find((t) => t.id === 'lisbon'), state.items[0].id)
  state.actions = [{ ...reply.action, id: 'test-action', mode: 'simulated', status: 'proposed', cursor: 0, log: [], answers: [], createdAt: 0 }]
  return state
}
const update = (s, type, extra = {}) => reducer(s, { type, id: 'test-action', ...extra })
const tick = (s) => update(s, 'tick')
const approve = (s) => update(s, 'approve', { script: 'Approved dinner request' })
const runToQuestion = (s) => tick(tick(tick(approve(s))))
const memoryStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial))
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }
}

test('proposals cannot execute or accept answers before approval', () => {
  const state = fixture()
  assert.deepEqual(tick(state), state)
  assert.deepEqual(update(state, 'answer', { answer: '7:00pm Saturday' }), state)
  assert.deepEqual(update(state, 'approve', { script: '  ' }), state)
})
test('duplicate approvals and late answers do not restart progress', () => {
  const state = tick(approve(fixture()))
  assert.deepEqual(approve(state), state)
  assert.deepEqual(update(state, 'answer', { answer: '7:00pm Saturday' }), state)
})
test('only the offered answer advances a waiting action, once', () => {
  const state = runToQuestion(fixture())
  assert.equal(state.actions[0].status, 'needs_input')
  assert.deepEqual(update(state, 'answer', { answer: 'invented answer' }), state)
  const answered = update(state, 'answer', { answer: '8:30pm Sunday' })
  assert.equal(answered.actions[0].cursor, 3)
  assert.deepEqual(update(answered, 'answer', { answer: '8:30pm Sunday' }), answered)
})
test('verified dinner creates one booking and completes its linked task exactly once', () => {
  let state = runToQuestion(fixture())
  const before = state.trips.find((t) => t.id === 'lisbon').bookings.length
  state = update(state, 'answer', { answer: '8:30pm Sunday' })
  for (let i = 0; i < 4; i++) state = tick(state)
  assert.equal(state.actions[0].status, 'verified')
  const trip = state.trips.find((t) => t.id === 'lisbon')
  assert.equal(trip.bookings.length, before + 1)
  assert.match(trip.bookings.at(-1).when, /Sunday|Sun/)
  assert.equal(state.items[0].done, true)
  assert.deepEqual(tick(state), state)
  assert.deepEqual(approve(state), state)
  assert.deepEqual(update(state, 'cancel'), state)
})
test('declining a reservation creates no booking and leaves the task open', () => {
  let state = runToQuestion(fixture())
  state.items[0].done = false
  const trips = structuredClone(state.trips)
  state = update(state, 'answer', { answer: 'Neither, cancel' })
  for (let i = 0; i < 5; i++) state = tick(state)
  assert.equal(state.actions[0].status, 'cancelled')
  assert.deepEqual(state.trips, trips)
  assert.equal(state.items[0].done, false)
  assert.deepEqual(approve(state), state)
})
test('completion without evidence fails without changing bookings or tasks', () => {
  const state = fixture()
  state.actions[0] = { ...state.actions[0], status: 'done', result: { summary: 'Claim only', evidence: [' '] } }
  const next = tick(state)
  assert.equal(next.actions[0].status, 'failed')
  assert.deepEqual(next.trips, state.trips)
  assert.deepEqual(next.items, state.items)
})
test('the simulator never approves or advances real actions', () => {
  const state = fixture()
  state.actions[0].mode = 'real'
  assert.deepEqual(approve(state), state)
  state.actions[0].status = 'running'
  assert.deepEqual(tick(state), state)
})
test('valid state, including an in-progress action, survives saving and loading', () => {
  const state = runToQuestion(fixture())
  const storage = memoryStorage()
  assert.equal(isAppState(state), true)
  assert.equal(saveState(state, () => storage), true)
  assert.deepEqual(loadState(() => storage), { state: JSON.parse(JSON.stringify(state)), warning: null })
})
test('missing storage starts the demo without warning', () => {
  const loaded = loadState(() => memoryStorage())
  assert.equal(isAppState(loaded.state), true)
  assert.equal(loaded.warning, null)
})
test('invalid JSON and incompatible nested data are backed up before recovery', () => {
  const broken = fixture()
  broken.trips[0].options = [null]
  for (const raw of ['{broken', 'null', '{}', JSON.stringify(broken)]) {
    const storage = memoryStorage({ [STORAGE_KEY]: raw })
    const loaded = loadState(() => storage)
    assert.equal(isAppState(loaded.state), true)
    assert.ok(loaded.warning)
    assert.equal(storage.getItem(RECOVERY_KEY), raw)
  }
})
test('blocked storage and quota errors do not throw', () => {
  const blocked = () => { throw new Error('SecurityError') }
  assert.ok(loadState(blocked).warning)
  assert.equal(saveState(fixture(), blocked), false)
  assert.equal(saveState(fixture(), () => ({ setItem() { throw new Error('QuotaExceededError') } })), false)
})
