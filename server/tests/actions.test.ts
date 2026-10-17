import test from 'node:test'
import assert from 'node:assert/strict'
import { Store } from '../store.ts'
import { ActionError } from '../actions.ts'
import { approve, draft, settle, setup } from './helpers.ts'

const OWNER = 'user-a'
const throwsStatus = (fn: () => unknown, status: number) =>
  assert.throws(fn, (e: unknown) => e instanceof ActionError && e.status === status)

test('nothing is sent before approval, and approval binds to the exact content hash', async () => {
  const s = setup()
  const a = s.service.create(OWNER, draft())
  await settle(s, OWNER, a.id)
  assert.equal(s.fo.sends, 0)
  assert.equal(s.service.get(OWNER, a.id).status, 'proposed')
  assert.match(a.foMessage, /To: Gion Machiya House <stay@gion-machiya\.example>/)
  assert.match(a.foMessage, new RegExp(a.ref))

  // An edit changes the hash; approving the old hash is refused.
  const edited = s.service.edit(OWNER, a.id, { ...draft(), body: 'Changed text' })
  assert.notEqual(edited.contentHash, a.contentHash)
  throwsStatus(() => approve(s, OWNER, a), 409)
  assert.equal(s.fo.sends, 0)
  // Edits can't move the request to another trip or task.
  const moved = s.service.edit(OWNER, a.id, { ...draft(), body: 'Changed text', tripId: 'other', checklistItemId: 'x' })
  assert.equal(moved.draft.tripId, 'kyoto-2027')
  assert.equal(moved.draft.checklistItemId, 'item-1')
})

test('default mock run: sent with evidence → verified "request sent", task stays open', async () => {
  const s = setup()
  const a = s.service.create(OWNER, draft())
  approve(s, OWNER, a)
  const done = await settle(s, OWNER, a.id)
  assert.equal(done.status, 'verified')
  assert.equal(s.fo.sends, 1)
  assert.equal(done.result?.outcome, 'request_sent')
  assert.equal(done.result?.itemDone, false)
  assert.match(done.result!.itemNote, /awaiting reply/)
  assert.ok(done.result?.evidence.some((e) => e.kind === 'email_sent' && e.messageId))
  // Edits after approval are refused.
  throwsStatus(() => s.service.edit(OWNER, a.id, draft({ body: 'late edit' })), 409)
})

test('a transfer quote is reported as a quote, never as a booking or a finished task', async () => {
  const s = setup()
  const a = s.service.create(OWNER, draft({ to: 'stay+confirm@gion-machiya.example', transferQuote: true }))
  approve(s, OWNER, a)
  const done = await settle(s, OWNER, a.id)
  assert.equal(done.status, 'verified')
  assert.equal(done.result?.outcome, 'checkin_confirmed')
  assert.equal(done.result?.transferQuote, '€35')
  assert.equal(done.result?.itemDone, false)
  assert.match(done.result!.itemNote, /quote €35, not booked/)
  assert.match(done.result!.summary, /nothing is booked/)
})

test('confirmed check-in without a transfer completes the task; a decline does not', async () => {
  const s = setup()
  const yes = s.service.create(OWNER, draft({ to: 'a+confirm@x.example' }))
  approve(s, OWNER, yes)
  assert.equal((await settle(s, OWNER, yes.id)).result?.itemDone, true)
  const no = s.service.create(OWNER, draft({ to: 'b+declined@x.example' }))
  approve(s, OWNER, no)
  const r = await settle(s, OWNER, no.id)
  assert.equal(r.result?.outcome, 'checkin_declined')
  assert.equal(r.result?.itemDone, false)
})

test('"done" with no send record in Fo\'s transcript is unverified', async () => {
  const s = setup()
  const a = s.service.create(OWNER, draft({ to: 'x+noevidence@x.example' }))
  approve(s, OWNER, a)
  const r = await settle(s, OWNER, a.id)
  assert.equal(r.status, 'unverified')
  assert.equal(r.result, undefined)
  assert.match(r.error!, /don't show an email/)
})

test('duplicate approvals: same key is idempotent, others are refused, and Fo gets one send', async () => {
  const s = setup()
  const a = s.service.create(OWNER, draft())
  const first = approve(s, OWNER, a, 'same-key-123')
  assert.deepEqual(approve(s, OWNER, a, 'same-key-123'), first)
  throwsStatus(() => approve(s, OWNER, a, 'another-key-456'), 409)
  // A second request with the same email can't be approved while the first stands.
  const twin = s.service.create(OWNER, draft())
  throwsStatus(() => approve(s, OWNER, twin), 409)
  await settle(s, OWNER, a.id)
  assert.equal(s.fo.sends, 1)
})

test('other users can neither see nor act on an action', () => {
  const s = setup()
  const a = s.service.create(OWNER, draft())
  for (const fn of [
    () => s.service.get('intruder', a.id),
    () => approve(s, 'intruder', a),
    () => s.service.cancel('intruder', a.id),
    () => s.service.edit('intruder', a.id, draft()),
  ]) throwsStatus(fn, 404)
  assert.deepEqual(s.service.list('intruder'), [])
})

test('Fo questions wait for the owner; nothing answers them automatically', async () => {
  const s = setup()
  const a = s.service.create(OWNER, draft({ to: 'x+needs@x.example' }))
  approve(s, OWNER, a)
  let r = await settle(s, OWNER, a.id)
  assert.equal(r.status, 'needs_input')
  assert.match(r.question!, /CC/)
  // Plenty of worker time passes; still waiting, no extra messages to Fo.
  for (let i = 0; i < 20; i++) {
    s.clock.t += 5000
    await s.service.runDue()
  }
  r = s.service.get(OWNER, a.id)
  assert.equal(r.status, 'needs_input')
  const convo = await s.fo.conversation(OWNER, r.conversationId!)
  assert.equal(convo.filter((m) => m.role === 'user').length, 1)

  throwsStatus(() => s.service.answer(OWNER, a.id, '   '), 400)
  s.service.answer(OWNER, a.id, 'No, just me')
  r = await settle(s, OWNER, a.id)
  assert.equal(r.status, 'verified')
  assert.deepEqual(r.answers.map((x) => x.text), ['No, just me'])
})

test('provider failure is final and not blindly retryable', async () => {
  const s = setup()
  const a = s.service.create(OWNER, draft({ to: 'x+fail@x.example' }))
  approve(s, OWNER, a)
  const r = await settle(s, OWNER, a.id)
  assert.equal(r.status, 'failed')
  assert.equal(r.retryable, false)
  assert.match(r.error!, /not connected/)
  throwsStatus(() => s.service.retry(OWNER, a.id), 409)
})

test('uncertain send: Fo got it → reconciled, never sent twice', async () => {
  const s = setup()
  const a = s.service.create(OWNER, draft({ to: 'x+uncertain@x.example' }))
  approve(s, OWNER, a)
  s.clock.t += 1
  await s.service.runDue()
  assert.equal(s.service.get(OWNER, a.id).status, 'send_uncertain')
  const r = await settle(s, OWNER, a.id)
  assert.equal(s.fo.sends, 1)
  assert.ok(r.progress.some((p) => /without resending/.test(p.text)))
  assert.ok(r.conversationId)
})

test('lost send: Fo has no record → failed (retryable) → owner retry reconciles, then sends once', async () => {
  const s = setup()
  const a = s.service.create(OWNER, draft({ to: 'x+lost@x.example' }))
  approve(s, OWNER, a)
  let r = await settle(s, OWNER, a.id)
  assert.equal(r.status, 'failed')
  assert.equal(r.retryable, true)
  assert.equal(s.fo.sends, 0)
  r = s.service.retry(OWNER, a.id)
  assert.equal(r.status, 'send_uncertain')
  // Still "lost" on retry, so it fails again, but only after reconciling first.
  r = await settle(s, OWNER, a.id)
  assert.ok(r.progress.some((p) => /no record of it. Sending once/.test(p.text)))
  assert.equal(r.status, 'failed')
})

test('timeout stops waiting; a read-only check resumes polling', async () => {
  const s = setup()
  const a = s.service.create(OWNER, draft({ to: 'x+timeout@x.example' }))
  approve(s, OWNER, a)
  const r = await settle(s, OWNER, a.id)
  assert.equal(r.status, 'timeout')
  assert.equal(s.fo.sends, 1)
  assert.equal(s.service.check(OWNER, a.id).status, 'waiting')
  assert.equal(s.fo.sends, 1)
})

test('cancellation is allowed before sending and while Fo waits, refused mid-flight', async () => {
  const s = setup()
  const a = s.service.create(OWNER, draft())
  assert.equal(s.service.cancel(OWNER, a.id).status, 'cancelled')
  throwsStatus(() => approve(s, OWNER, a), 409)
  const b = s.service.create(OWNER, draft({ body: 'another' }))
  approve(s, OWNER, b)
  s.clock.t += 1
  await s.service.runDue() // now waiting on Fo
  throwsStatus(() => s.service.cancel(OWNER, b.id), 409)
})

test('restart recovery: a crash mid-send is reconciled; waiting actions resume', async () => {
  const s = setup()
  const a = s.service.create(OWNER, draft())
  approve(s, OWNER, a)
  // Simulate a crash after "sending" was saved but before Fo answered.
  s.store.data.actions[a.id].status = 'sending'
  const b = s.service.create(OWNER, draft({ body: 'second', to: 'y@x.example' }))
  approve(s, OWNER, b)
  s.clock.t += 1
  await s.service.runDue()
  assert.equal(s.service.get(OWNER, b.id).status, 'waiting')

  // New process, same durable data.
  const store2 = new Store()
  store2.data = structuredClone(s.store.data)
  const s2 = setup({ store: store2 })
  s2.clock.t = s.clock.t
  s2.service.recover()
  assert.equal(s2.service.get(OWNER, a.id).status, 'send_uncertain')
  const ra = await settle(s2, OWNER, a.id)
  // Fo never got it (the crash happened first), so it fails safely instead of resending.
  assert.equal(ra.status, 'failed')
  assert.equal(ra.retryable, true)
  const rb = await settle(s2, OWNER, b.id)
  assert.equal(rb.status, 'verified')
  assert.equal(s2.fo.sends, 0, 'the restarted server sent nothing new')
})

test('live mode only sends to allow-listed recipients', () => {
  const s = setup({ liveRecipients: ['me@example.com'] })
  Object.defineProperty(s.fo, 'mode', { value: 'live' })
  const a = s.service.create(OWNER, draft())
  throwsStatus(() => approve(s, OWNER, a), 403)
  const ok = s.service.create(OWNER, draft({ to: 'Me@Example.com' }))
  assert.equal(approve(s, OWNER, ok).status, 'approved')
})

test('drafts are validated', () => {
  const s = setup()
  for (const bad of [draft({ to: 'not-an-email' }), draft({ subject: 'two\nlines' }), draft({ body: ' ' }), { ...draft(), intent: 'book_hotel' }, draft({ toName: 'x <evil@x.com>' })]) {
    throwsStatus(() => s.service.create(OWNER, bad), 400)
  }
})
