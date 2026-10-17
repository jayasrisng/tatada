import type { Booking, ChecklistItem, DetailsForm, EmailDraft, FoAction, Profile, StayDetails, StayIntent, Trip } from '../types'
import { blockingFields, draftStayEmail, knownStay, missingFields, sharedData, shiftedArrival } from './stay'

/*
 * Simulated Magic brain. It stands in for Claude (reasoning) + Fo (execution)
 * when the Tatada server isn't available. Every action it produces is mode
 * 'simulated', and the UI labels it that way. Nothing here leaves the browser.
 *
 * Rules: names, dates, travelers, and bookings come from the selected trip and
 * profile. Missing details are asked for, never invented. Scripted replies
 * (restaurant call, hotel answer) exist only for the Lisbon demo fixture.
 */

export interface MagicReply {
  text: string
  bullets?: string[]
  action?: Omit<FoAction, 'id' | 'createdAt' | 'status' | 'cursor' | 'log' | 'answers' | 'mode'>
  addItems?: Omit<ChecklistItem, 'id'>[]
  form?: DetailsForm
}

export interface Outcome {
  summary: string
  evidence: string[]
  booking?: Omit<Booking, 'id'>
  /** Whether the linked checklist item is actually finished. */
  itemDone: boolean
  itemNote?: string
}

export interface ThinkContext {
  profile?: Profile
  /** Details the traveler just supplied in a form. */
  details?: StayDetails
  /** Existing checklist items, used to avoid duplicates. */
  items?: ChecklistItem[]
}

const NO_PROFILE: Profile = { name: '', homeAirport: '', style: [], diet: [], memberships: [] }
const has = (s: string, ...words: string[]) => words.some((w) => s.includes(w))
const clean = (d: StayDetails = {}): StayDetails =>
  Object.fromEntries(Object.entries(d).filter(([, v]) => typeof v === 'string' && v.trim()).map(([k, v]) => [k, (v as string).trim()]))

export function think(prompt: string, trip?: Trip, checklistItemId?: string, ctx: ThinkContext = {}): MagicReply {
  const p = prompt.toLowerCase()
  const profile = ctx.profile ?? NO_PROFILE
  // A task from another trip must never ride along with this request.
  const itemId = checklistItemId && ctx.items && !ctx.items.some((i) => i.id === checklistItemId && i.tripId === trip?.id) ? undefined : checklistItemId

  if (has(p, 'delay', 'missed', 'running late', 'late arrival')) return stayRequest('delay', prompt, trip, profile, itemId, ctx)
  if (has(p, 'check-in', 'check in', 'checkin', 'early arrival', 'transfer') && !has(p, 'flight check')) {
    return stayRequest('early_checkin', prompt, trip, profile, itemId, ctx)
  }
  if (has(p, 'dinner', 'restaurant', 'table', 'reserv', 'horta')) return dinner(trip, profile, itemId)
  if (has(p, 'pack', 'wear', 'outfit', 'weather', 'bring')) return packing(trip, ctx.items ?? [])

  // Anything else becomes a general Fo request, passed along verbatim.
  return {
    text: 'Fo can take this on from your Wajo account. I\'ll pass it along word for word once you approve.',
    action: {
      tripId: trip?.id,
      title: prompt.length > 48 ? prompt.slice(0, 46) + '…' : prompt,
      channel: 'fo',
      recipient: { name: 'Fo', contact: 'your Wajo account' },
      script: prompt,
      dataShared: trip ? [`${trip.destination} trip details`] : ['Only what\'s in this request'],
      cost: 'Fo will ask before spending anything',
      risk: 'medium',
      plan: [{ text: 'Fo received the request' }, { text: 'Fo is working on it…' }, { text: 'Fo reported back' }],
      outcomeKey: 'generic',
      outcomeData: { demo: !!trip?.demoScenario },
      checklistItemId: itemId,
    },
  }
}

function stayRequest(intent: StayIntent, prompt: string, trip: Trip | undefined, profile: Profile, itemId: string | undefined, ctx: ThinkContext): MagicReply {
  if (!trip) return { text: 'Which trip is this for? Pick one above and ask again.' }
  const supplied = clean(ctx.details)
  const known = knownStay(trip)
  const details: StayDetails = { ...known, ...supplied }
  if (intent === 'delay') details.arrivalTime = supplied.arrivalTime ?? shiftedArrival(prompt, known.arrivalTime)

  const blocking = blockingFields(trip, details)
  if (blocking.length) {
    const fields = missingFields(trip, details).map((f) =>
      intent === 'delay' && f.key === 'arrivalTime' ? { ...f, label: 'New arrival time' } : f,
    )
    return {
      text: 'I need a few details from your booking first. I won\'t guess contacts, dates, or times.',
      form: { intent, tripId: trip.id, itemId, prompt, fields },
    }
  }

  const transfer = intent === 'early_checkin' && has(prompt.toLowerCase(), 'transfer', 'pickup', 'pick-up', 'shuttle')
  const email: EmailDraft = draftStayEmail(intent, trip, profile, details as Required<StayDetails>, transfer)
  const demo = !!trip.demoScenario
  return {
    text: intent === 'early_checkin'
      ? `Here's the email Fo would send to ${email.toName}, based on your ${trip.destination} booking. Nothing goes out until you approve.`
      : `Here's a heads-up for ${email.toName} about your new arrival time. Nothing goes out until you approve.`,
    action: {
      tripId: trip.id,
      title: intent === 'early_checkin' ? `Ask for early check-in${transfer ? ' + transfer quote' : ''}` : 'Tell the stay we\'re delayed',
      channel: 'email',
      recipient: { name: email.toName, contact: email.to },
      script: email.body,
      dataShared: sharedData(trip, profile, details.ref),
      cost: 'Free to ask',
      risk: 'low',
      plan: [
        { text: 'Fo drafted the email' },
        { text: 'Sent from your email account' },
        ...(demo ? [{ text: `Reply received from ${email.toName} (sample)` }] : []),
      ],
      outcomeKey: intent === 'early_checkin' ? 'stay_email' : 'delay_email',
      outcomeData: { demo, transfer },
      email,
      checklistItemId: itemId,
    },
  }
}

function dinner(trip: Trip | undefined, profile: Profile, itemId: string | undefined): MagicReply {
  if (trip?.demoScenario !== 'lisbon') {
    return {
      text: `Restaurant reservations aren't connected${trip ? ` for ${trip.destination}` : ''} yet, and I won't make up a place or a phone number. Add the restaurant to your checklist so it doesn't slip.`,
    }
  }
  const caller = profile.name.trim() ? `for ${profile.name.trim()}` : 'on behalf of a guest'
  return {
    text: 'Horta da Graça only takes reservations by phone. Fo can call them for you. This is a scripted demo scenario.',
    action: {
      tripId: trip.id,
      title: `Book Saturday dinner for ${trip.travelers}`,
      channel: 'call',
      recipient: { name: 'Horta da Graça', contact: '+351 21 000 0000 (sample)' },
      script: `Hi, I'm calling ${caller}. Could we book a table for ${trip.travelers} this Saturday, Nov 7, around 8pm, for the vegetarian tasting menu? A window table would be lovely if you have one.`,
      dataShared: ['Your first name', 'Party size', 'Your phone number for the booking'],
      cost: 'No deposit expected · €55 pp at the restaurant',
      risk: 'medium',
      plan: [
        { text: 'Fo is calling Horta da Graça…' },
        { text: 'Connected. Asking for Saturday at 8pm' },
        {
          text: 'The restaurant offered other times',
          question: {
            text: '8pm is full. They can do 7:00pm Saturday (Nov 7) or 8:30pm Sunday (Nov 8). Which one?',
            options: ['7:00pm Saturday', '8:30pm Sunday', 'Neither, cancel'],
          },
        },
        { text: 'Fo confirmed your choice with the host' },
        { text: 'Confirmation text received' },
      ],
      outcomeKey: 'dinner',
      outcomeData: { demo: true },
      checklistItemId: itemId,
    },
  }
}

function packing(trip: Trip | undefined, items: ChecklistItem[]): MagicReply {
  if (!trip) return { text: 'Pick a trip above and I\'ll check its packing list.' }
  const demo = trip.demoScenario === 'lisbon'
  const wanted = demo
    ? ['Grippy walking shoes', 'Type F plug adapter']
    : ['Comfortable walking shoes', 'An extra layer for evenings', 'Phone charger + plug adapter']
  const onList = new Set(items.filter((i) => i.tripId === trip.id).map((i) => i.text.trim().toLowerCase()))
  const fresh = wanted.filter((w) => !onList.has(w.toLowerCase()))
  const intro = demo
    ? 'Sample forecast for Lisbon in early November: mild days, cool nights, maybe two rainy afternoons. Pack for layers.'
    : `I don't have a forecast for ${trip.destination} connected, so I'm sticking to basics.`
  return {
    text: fresh.length ? `${intro} I added what was missing to your checklist.` : `${intro} Those are already on your list.`,
    bullets: wanted,
    addItems: fresh.map((text) => ({ tripId: trip.id, phase: 'prepare', text, done: false, kind: 'pack' })),
  }
}

export function outcome(key: string | undefined, answers: string[], data?: FoAction['outcomeData']): Outcome | 'cancelled' {
  const demo = !!data?.demo
  switch (key) {
    case 'stay_email':
      if (!demo) {
        return {
          summary: 'Request sent (simulated). There\'s no reply yet, and Tatada won\'t invent one.',
          evidence: ['Simulated send log. No email left this browser.'],
          itemDone: false,
          itemNote: 'requested (simulated)',
        }
      }
      return {
        summary: `The guesthouse replied (sample): early check-in from noon is fine.${data?.transfer ? ' They quoted €35 for an airport transfer. That\'s a quote, so nothing is booked.' : ''}`,
        evidence: ['Sample reply email (demo fixture, not a real message)'],
        // A transfer quote leaves the transfer part of the task open.
        itemDone: !data?.transfer,
        itemNote: data?.transfer ? 'early check-in ok · transfer quote €35, not booked' : 'early check-in confirmed',
      }
    case 'delay_email':
      return demo
        ? { summary: 'The host replied (sample): no problem, the room is held.', evidence: ['Sample reply email (demo fixture)'], itemDone: false }
        : { summary: 'Heads-up sent (simulated). No reply yet.', evidence: ['Simulated send log. No email left this browser.'], itemDone: false }
    case 'dinner': {
      const pick = answers[0] ?? '7:00pm Saturday'
      if (pick.startsWith('Neither')) return 'cancelled'
      const sunday = pick.includes('Sunday')
      return {
        summary: `Table booked at Horta da Graça, ${pick}. Tasting menu noted.`,
        evidence: [`Confirmation SMS (sample): "Reserva confirmada · ${sunday ? 'Dom 8 Nov 20:30' : 'Sáb 7 Nov 19:00'}"`, 'Call summary (sample): 2m 41s'],
        booking: { kind: 'dinner', title: 'Horta da Graça', when: sunday ? 'Sun, Nov 8 · 8:30pm' : 'Sat, Nov 7 · 7:00pm', at: sunday ? '2026-11-08T20:30' : '2026-11-07T19:00', ref: 'HG-0811', detail: 'Veg tasting · €55 pp', simulated: true },
        itemDone: true,
      }
    }
    default:
      return { summary: 'Fo reported back (simulated). There\'s nothing real to check.', evidence: ['Simulated transcript'], itemDone: false, itemNote: 'Fo replied (simulated)' }
  }
}

export const SUGGESTIONS = [
  'Ask my stay for early check-in',
  'Book a vegetarian dinner Saturday',
  'What should I pack?',
  'My flight is delayed 3 hours',
]
