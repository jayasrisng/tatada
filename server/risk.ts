/*
 * Risk categories for anything Tatada sends to Fo. Fo can act in the real
 * world, so Tatada enforces its own gate: these categories need a separate,
 * explicit confirmation on top of the normal "send" approval. Deliberately
 * broad: a false alarm costs one extra tap; a miss could cost money.
 * Fo's own conversational safeguards are not relied on.
 */

export type RiskCategory = 'payment' | 'booking' | 'cancellation' | 'third_party_message'

const RULES: [RiskCategory, RegExp][] = [
  ['payment', /\b(pay|paid|payment|purchase|buy|order|checkout|check out|charge|subscribe|tip|donate|transfer money|venmo|paypal|card)\b|[$€£¥]\s?\d/i],
  ['booking', /\b(book|booking|reserve|reservation|rsvp|schedule|appointment|hold a|sign me up|register)\b/i],
  ['cancellation', /\b(cancel|cancellation|refund|unsubscribe|delete|remove my|terminate|return (it|the|my))\b/i],
  ['third_party_message', /\b(email|e-mail|mail|text|sms|message|call|phone|ring|whatsapp|slack|dm|reply|respond|forward|invite|send|tell|let .{1,40} know|contact|notify|post)\b/i],
]

export const RISK_LABELS: Record<RiskCategory, string> = {
  payment: 'Fo may spend money or make a purchase',
  booking: 'Fo may book or reserve something',
  cancellation: 'Fo may cancel, refund, or delete something',
  third_party_message: 'Fo may contact someone on your behalf',
}

/** Categories in the outgoing text, plus any Fo raised in the question being answered. */
export function riskOf(text: string, answering?: string): RiskCategory[] {
  const found = new Set<RiskCategory>()
  for (const [cat, re] of RULES) if (re.test(text) || (answering && re.test(answering))) found.add(cat)
  return [...found]
}
