import type { Claim, Collision, DecisionRecord, Trip, Verdict } from '../types'
import { fmtDay, fmtTime, isTime } from './dates'
import { knownStay, stayBooking } from './stay'

/*
 * Early check-in, decided in the open. Adapted from Product.ai's
 * Diverge → Collide → Converge → Validate:
 *   Diverge   gather competing claims, deliberately including disagreement
 *   Collide   set them against each other; unresolvable conflicts and rule-outs become disqualifiers
 *   Converge  keep what survives and say what to do, and why
 *   Validate  only the stay can settle it: ask through Fo, after approval, and accept only evidence
 * Confidence is expressed as kinds and statuses with reasons, never as invented scores.
 */

export interface CheckinDecision {
  question: string
  claims: Claim[]
  collisions: Collision[]
  verdict: Verdict
  rationale: string
  missing: ('arrival' | 'standardCheckIn')[]
}

const mins = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
const span = (m: number) => `${Math.floor(m / 60) ? `${Math.floor(m / 60)}h` : ''}${m % 60 ? ` ${m % 60}m` : ''}`.trim()

export function decideEarlyCheckin(trip: Trip, rec?: DecisionRecord): CheckinDecision {
  const hotel = stayBooking(trip)?.title ?? 'your stay'
  const known = knownStay(trip)
  const std = rec?.inputs.standardCheckIn
  const policy = rec?.inputs.policy
  const v = rec?.validation
  const claims: Claim[] = []
  const collisions: Collision[] = []
  const missing: CheckinDecision['missing'] = []
  const by = (id: string) => claims.find((c) => c.id === id)

  /* ── Diverge ── */
  if (known.arrivalTime && known.checkIn) {
    claims.push({ id: 'arrival', kind: 'fact', status: 'holds', text: `You expect to arrive ${fmtDay(known.checkIn)}, around ${fmtTime(known.arrivalTime)}.`, source: { kind: 'trip', label: 'your trip details' } })
  } else missing.push('arrival')

  if (std && isTime(std.value)) {
    claims.push({
      id: 'standard', kind: 'fact', status: 'holds', text: `${hotel}'s check-in starts at ${fmtTime(std.value)}.`,
      source: std.source === 'demo' ? { kind: 'demo', label: 'demo booking data', at: std.at } : { kind: 'you', label: 'you, from your confirmation', at: std.at },
    })
  } else {
    missing.push('standardCheckIn')
    claims.push({ id: 'standard-guess', kind: 'hypothesis', status: 'open', text: 'Check-in usually starts mid-afternoon (around 2–4pm).', source: { kind: 'general', label: 'general travel knowledge' }, uncertainty: 'Not from your booking. Add the time on your confirmation.' })
  }

  const dayUncertainty = 'Depends on that day\'s occupancy. Only the stay can say.'
  claims.push({ id: 'possible', kind: 'hypothesis', status: 'open', text: `${hotel} may let you check in early if your room is ready.`, source: { kind: 'general', label: 'general travel knowledge' }, uncertainty: dayUncertainty })
  // Deliberate disagreement: the counter-claim is gathered, not ignored.
  claims.push({ id: 'not-possible', kind: 'hypothesis', status: 'open', text: 'Early check-in may be unavailable that day, or cost extra.', source: { kind: 'general', label: 'general travel knowledge' }, uncertainty: dayUncertainty })

  if (policy) {
    claims.push({
      id: 'policy', kind: 'fact', status: 'holds',
      text: policy.value === 'not_offered' ? 'Your confirmation says early check-in isn\'t offered.' : 'Your confirmation says early check-in is available on request.',
      source: { kind: policy.source === 'demo' ? 'demo' : 'you', label: policy.source === 'demo' ? 'demo booking data' : 'you, from your confirmation', at: policy.at },
    })
  }

  if (v) {
    const fo = v.provider === 'live' ? { kind: 'fo_live' as const, label: 'Fo\'s records (live)', at: v.at } : { kind: 'fo_mock' as const, label: 'mock Fo, not a real reply', at: v.at }
    if (v.status === 'verified') claims.push({ id: 'outcome', kind: 'outcome', status: 'confirmed', text: v.summary, source: fo, evidence: v.evidence })
    // Fo saying "done" without proof is just another claim, and it doesn't count.
    else claims.push({ id: 'fo-claim', kind: 'hypothesis', status: 'disqualified', text: 'Fo said the request went out.', source: { ...fo, label: `${fo.label}: its own words` }, uncertainty: 'No send record in Fo\'s records, so this isn\'t evidence.' })
  }

  /* ── Collide ── */
  const arrival = by('arrival')
  const standard = by('standard')
  const gap = arrival && standard ? mins(std!.value) - mins(known.arrivalTime!) : undefined
  if (gap !== undefined && gap <= 0) {
    collisions.push({ between: ['arrival', 'standard'], note: 'You arrive at or after check-in time, so early check-in doesn\'t apply.', disqualifier: true })
    by('possible')!.status = 'disqualified'
    by('not-possible')!.status = 'disqualified'
  }
  if (policy?.value === 'not_offered') {
    collisions.push({ between: ['policy', 'possible'], note: 'Your confirmation rules out early check-in, which contradicts "may be possible".', disqualifier: true })
    by('possible')!.status = 'disqualified'
    by('not-possible')!.status = 'holds'
  } else if (policy?.value === 'on_request') {
    collisions.push({ between: ['policy', 'not-possible'], note: '"On request" supports asking, but it isn\'t a promise.', disqualifier: false })
  }
  const outcome = v?.status === 'verified' ? v.outcome : undefined
  if (outcome === 'checkin_confirmed') {
    by('possible')!.status = 'confirmed'
    by('not-possible')!.status = 'refuted'
  } else if (outcome === 'checkin_declined') {
    by('possible')!.status = 'refuted'
    by('not-possible')!.status = 'confirmed'
  } else if (by('possible')!.status === 'open' && by('not-possible')!.status === 'open') {
    collisions.push({ between: ['possible', 'not-possible'], note: `These contradict, and nothing we have settles it. Only ${hotel} can.`, disqualifier: false })
  }
  if (v?.status === 'unverified') collisions.push({ between: ['fo-claim'], note: 'A claim of success with no proof is set aside.', disqualifier: true })

  /* ── Converge ── */
  let verdict: Verdict
  let rationale: string
  const mock = v?.provider === 'mock' ? ' This came from mock Fo, so it isn\'t a real reply.' : ''
  if (outcome === 'checkin_confirmed') (verdict = 'confirmed'), (rationale = `${hotel} confirmed in writing.${mock}`)
  else if (outcome === 'checkin_declined') (verdict = 'declined'), (rationale = `${hotel} said no.${mock} Plan to drop your bags and explore.`)
  else if (outcome) (verdict = 'awaiting_reply'), (rationale = `Your request reached ${hotel}. Until they reply, early check-in is still a hypothesis.${mock}`)
  else if (gap !== undefined && gap <= 0) (verdict = 'not_needed'), (rationale = `You arrive after check-in starts (${fmtTime(std!.value)}), so there's nothing to ask.`)
  else if (policy?.value === 'not_offered') (verdict = 'dont_ask'), (rationale = 'Your confirmation says it isn\'t offered. Asking is unlikely to help, unless you want to try anyway.')
  else if (missing.length) {
    verdict = 'need_info'
    rationale = `Missing ${missing.map((m) => (m === 'arrival' ? 'your arrival time' : 'their standard check-in time')).join(' and ')}, so I can't tell how early you'd be. You can still ask.`
  } else (verdict = 'ask'), (rationale = `You arrive ${span(gap!)} before check-in starts. Whether they can take you early is still a hypothesis, and asking ${hotel} is the only way to settle it.`)

  return { question: `Can you check in early at ${hotel}?`, claims, collisions, verdict, rationale, missing }
}

export const decisionFor = (decisions: DecisionRecord[] | undefined, tripId: string) => decisions?.find((d) => d.tripId === tripId && d.topic === 'early_checkin')
