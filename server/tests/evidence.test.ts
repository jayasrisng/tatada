import test from 'node:test'
import assert from 'node:assert/strict'
import { classify, extractEvidence } from '../evidence.ts'
import { normalizeReply, normalizeTranscript } from '../fo.ts'
import { draft } from './helpers.ts'

const d = draft()
const entry = (role: string, text: string, meta: Record<string, unknown> = {}) => ({ role, text, meta })

test('prose claims are never evidence', () => {
  const t = [entry('user', `please email ${d.to}`), entry('assistant', `Done! I sent the email to ${d.to}.`), entry('fo', 'sent')]
  assert.deepEqual(extractEvidence(t, d), [])
  assert.equal(classify(d, []), undefined)
})

test('a tool send record for the approved recipient is evidence; another recipient is not', () => {
  const ok = extractEvidence([entry('tool', 'email.send ok', { to: d.to, messageId: '<abc@mail>', status: 'sent' })], d)
  assert.equal(ok[0].kind, 'email_sent')
  assert.equal(ok[0].messageId, '<abc@mail>')
  assert.deepEqual(extractEvidence([entry('tool', 'sent', { to: 'someone@else.example', status: 'sent' })], d), [])
})

test('replies only count after the send and from the recipient', () => {
  const before = [entry('tool', 'Yes, early check-in is fine', { from: d.to }), entry('tool', 'sent', { to: d.to, status: 'sent' })]
  assert.deepEqual(extractEvidence(before, d).map((e) => e.kind), ['email_sent'])
  const stranger = [entry('tool', 'sent', { to: d.to, status: 'sent' }), entry('tool', 'Yes, early check-in!', { from: 'spam@x.example' })]
  assert.deepEqual(extractEvidence(stranger, d).map((e) => e.kind), ['email_sent'])
})

test('reply classification and quote handling', () => {
  const sent = { kind: 'email_sent' as const, detail: 'sent' }
  const reply = (detail: string) => ({ kind: 'email_reply' as const, detail })
  assert.equal(classify(d, [sent, reply('Unfortunately we cannot offer early check-in.')])?.outcome, 'checkin_declined')
  assert.equal(classify(d, [sent, reply('Hmm, let me ask the manager.')])?.outcome, 'reply_received')
  const q = classify({ ...d, transferQuote: true }, [sent, reply('Yes, early check-in is no problem. Transfer is 4500 JPY... or $40.')])!
  assert.equal(q.outcome, 'checkin_confirmed')
  assert.equal(q.itemDone, false)
  assert.match(q.itemNote, /not booked/)
})

test('unknown Fo reply shapes degrade to "working", never to "complete"', () => {
  assert.equal(normalizeReply({ content: [{ type: 'text', text: 'Something happened.' }] }).status, 'working')
  assert.equal(normalizeReply({ structuredContent: { status: 'complete', conversationId: 'c1', reply: 'ok' } }).status, 'complete')
  assert.equal(normalizeReply({ content: [{ type: 'text', text: '{"status":"working","conversationId":"c2","progress":"Fo is waiting for your answer"}' }] }).status, 'needs_user')
  assert.equal(normalizeReply({ isError: true, content: [] }).status, 'failed')
  assert.equal(normalizeReply({ structuredContent: { status: 'working', conversation_id: 'c3' } }).conversationId, 'c3')
})

test('transcripts parse from structured, JSON-text, or plain-text output', () => {
  const s = normalizeTranscript({ structuredContent: { messages: [{ role: 'tool', content: [{ type: 'text', text: 'sent' }], to: 'a@b.example' }] } })
  assert.equal(s[0].role, 'tool')
  assert.equal(s[0].text, 'sent')
  assert.equal(s[0].meta.to, 'a@b.example')
  const plain = normalizeTranscript({ content: [{ type: 'text', text: 'User: hi\nFo: sent it' }] })
  assert.deepEqual(plain.map((e) => e.role), ['user', 'fo'])
})
