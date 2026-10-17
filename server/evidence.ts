import type { TranscriptEntry } from './fo.ts'
import type { ActionDraft, ActionResult, Evidence, Outcome } from './types.ts'

/*
 * Evidence rules. Prose from Fo or the user is never evidence: "Done, I sent
 * it" proves nothing. Evidence must come from a tool/system record in Fo's
 * transcript, and must name the exact recipient the owner approved.
 */

const RECORD_ROLES = new Set(['tool', 'system', 'tool_result'])
const SENT = /\b(sent|delivered|queued for delivery)\b|message[-_ ]?id/i
const MESSAGE_ID = /<[^<>\s@]+@[^<>\s]+>|message[-_ ]?id["']?\s*[:=]\s*["']?([^\s"',}]+)/i
const DECLINE = /\b(unfortunately|not possible|cannot|can't|unable|fully booked|no early)\b/i
const CONFIRM = /\b(yes|happy to|no problem|confirmed|of course|possible|will be ready|is fine)\b/i
const PRICE = /(?:€|EUR|\$|USD|£)\s?\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?\s?(?:€|EUR|euros?|USD|dollars?)/i

const isRecord = (e: TranscriptEntry) => RECORD_ROLES.has(e.role)
const blob = (e: TranscriptEntry) => `${e.text} ${JSON.stringify(e.meta)}`.toLowerCase()
// Compare extracted addresses, never substrings (stay@hotel ≠ otherstay@hotel).
const addresses = (value: unknown): string[] => String(value ?? '').toLowerCase().match(/[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? []
const mentions = (value: unknown, address: string) => addresses(value).includes(address)
const EARLY_CHECKIN = /early[ -]check[ -]?in/i
const UNCERTAIN = /\b(not confirmed|not guaranteed|cannot guarantee|can't guarantee|subject to|depending on|if available|may be|might be|will check)\b/i
const NEGATED_SEND = /\b(not sent|never sent|failed to send|could not send|unable to send|not delivered)\b/i

export function extractEvidence(transcript: TranscriptEntry[], draft: ActionDraft): Evidence[] {
  const to = draft.to.toLowerCase()
  const out: Evidence[] = []
  let sentAt = -1
  transcript.forEach((e, i) => {
    if (!isRecord(e)) return
    const b = blob(e)
    const recipient = e.meta.to ?? (e.text.match(/^to:\s*(.+)$/im) ?? [])[1]
    if (sentAt < 0 && mentions(recipient, to) && SENT.test(b) && !NEGATED_SEND.test(b) && !mentions(e.meta.from, to)) {
      const id = (JSON.stringify(e.meta).match(MESSAGE_ID) ?? e.text.match(MESSAGE_ID) ?? [])
      out.push({ kind: 'email_sent', detail: `Sent to ${draft.to}`, messageId: id[1] ?? id[0] })
      sentAt = i
      return
    }
    const from = String(e.meta.from ?? (e.text.match(/^from:\s*(.+)$/im) ?? [])[1] ?? '').toLowerCase()
    if (sentAt >= 0 && i > sentAt && mentions(from, to)) {
      out.push({ kind: 'email_reply', detail: e.text.trim().slice(0, 400), from: draft.to })
    }
  })
  return out
}

export function classify(draft: ActionDraft, evidence: Evidence[]): ActionResult | undefined {
  if (!evidence.some((e) => e.kind === 'email_sent')) return undefined
  const reply = [...evidence].reverse().find((e) => e.kind === 'email_reply')
  const quote = draft.transferQuote && reply && /transfer/i.test(reply.detail) ? reply.detail.match(PRICE)?.[0] : undefined
  const quoteNote = quote ? ` · transfer quote ${quote}, not booked` : draft.transferQuote ? ' · transfer: no quote yet' : ''

  if (draft.intent === 'delay') {
    return { outcome: 'heads_up_sent', summary: `Sent your new arrival time to ${draft.toName}.`, evidence, itemDone: false, itemNote: 'late arrival sent' }
  }
  let outcome: Outcome = 'request_sent'
  if (reply && EARLY_CHECKIN.test(reply.detail)) {
    outcome = UNCERTAIN.test(reply.detail) ? 'reply_received' : DECLINE.test(reply.detail) ? 'checkin_declined' : CONFIRM.test(reply.detail) ? 'checkin_confirmed' : 'reply_received'
  } else if (reply) outcome = 'reply_received'

  const summary = {
    request_sent: `Your request was sent to ${draft.toName}. No reply yet.`,
    checkin_confirmed: `${draft.toName} replied: early check-in works.`,
    checkin_declined: `${draft.toName} replied: early check-in isn't possible.`,
    reply_received: `${draft.toName} replied. Read it to see what they said.`,
    heads_up_sent: '',
  }[outcome] + (quote ? ` They quoted ${quote} for a transfer. That's a quote, so nothing is booked.` : '')

  return {
    outcome,
    summary,
    evidence,
    transferQuote: quote,
    // The task is only finished when check-in is confirmed and nothing else is pending.
    itemDone: outcome === 'checkin_confirmed' && !draft.transferQuote,
    itemNote: {
      request_sent: 'requested · awaiting reply',
      checkin_confirmed: 'early check-in confirmed',
      checkin_declined: 'early check-in declined',
      reply_received: 'reply received · read it',
      heads_up_sent: '',
    }[outcome] + quoteNote,
  }
}
