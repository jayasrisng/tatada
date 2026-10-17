import type { Booking, ChecklistItem, FoAction, Trip } from '../types'

/*
 * Simulated Magic brain. It stands in for Claude (reasoning) + Fo (execution)
 * until the backend bridge exists. Every action it produces is mode
 * 'simulated', and the UI labels it that way. Nothing here leaves the browser.
 */

export interface MagicReply {
  text: string
  bullets?: string[]
  action?: Omit<FoAction, 'id' | 'createdAt' | 'status' | 'cursor' | 'log' | 'answers' | 'mode'>
  addItems?: Omit<ChecklistItem, 'id'>[]
}

export interface Outcome {
  summary: string
  evidence: string[]
  booking?: Omit<Booking, 'id'>
}

const has = (s: string, ...words: string[]) => words.some((w) => s.includes(w))

export function think(prompt: string, trip?: Trip, checklistItemId?: string): MagicReply {
  const p = prompt.toLowerCase()
  const where = trip?.destination ?? 'your trip'

  if (has(p, 'check-in', 'check in', 'checkin', 'early', 'transfer') && !has(p, 'flight check')) {
    return {
      text: 'I can have Fo email the guesthouse from your account. Here\'s exactly what it would send. Nothing goes out until you approve.',
      action: {
        tripId: trip?.id,
        title: 'Ask for early check-in + transfer quote',
        channel: 'email',
        recipient: { name: 'Casa do Largo', contact: 'reservas@casadolargo.example' },
        script:
          'Olá! We have booking CDL-48213 for Nov 7–11. Our flight lands at 11:30am. Could we check in early, around noon? Could you also quote a private transfer from the airport for 2 people with 2 bags? Obrigada!',
        dataShared: ['Your name', 'Booking ref CDL-48213', 'Arrival time'],
        cost: 'Free to ask',
        risk: 'low',
        plan: [
          { text: 'Fo drafted the email in your voice' },
          { text: 'Sent from your email account' },
          { text: 'Waiting for the guesthouse to reply…' },
          { text: 'Reply received from Casa do Largo' },
          { text: 'Fo read the reply and pulled out the details' },
        ],
        outcomeKey: 'checkin',
        checklistItemId,
      },
    }
  }

  if (has(p, 'dinner', 'restaurant', 'table', 'reserv', 'horta')) {
    return {
      text: 'Horta da Graça only takes reservations by phone. Fo can call them for you. Here\'s the plan, and it\'s yours to approve.',
      action: {
        tripId: trip?.id,
        title: 'Book Saturday dinner for 2',
        channel: 'call',
        recipient: { name: 'Horta da Graça', contact: '+351 21 000 0000 (sample)' },
        script:
          'Hi, I\'m calling for Ana. Could we book a table for 2 this Saturday, Nov 8, around 8pm, for the vegetarian tasting menu? A window table would be lovely if you have one.',
        dataShared: ['Your first name', 'Party size', 'Your phone number for the booking'],
        cost: 'No deposit expected · €55 pp at the restaurant',
        risk: 'medium',
        plan: [
          { text: 'Fo is calling Horta da Graça…' },
          { text: 'Connected. Asking for Saturday at 8pm' },
          {
            text: 'The restaurant offered other times',
            question: {
              text: '8pm is full. They can do 7:00pm Saturday or 8:30pm Sunday. Which one?',
              options: ['7:00pm Saturday', '8:30pm Sunday', 'Neither, cancel'],
            },
          },
          { text: 'Fo confirmed your choice with the host' },
          { text: 'Confirmation text received' },
        ],
        outcomeKey: 'dinner',
        checklistItemId,
      },
    }
  }

  if (has(p, 'pack', 'wear', 'outfit', 'weather', 'bring')) {
    return {
      text: `${where} in early November: mild days, cool nights, maybe two rainy afternoons (sample forecast). I'd pack for layers. I added the gaps to your checklist.`,
      bullets: ['Rain shell that packs small', 'Shoes with grip for the stone streets', 'One warm layer for evenings', 'Plug adapter (type F)'],
      addItems: [
        { tripId: trip?.id, phase: 'prepare', text: 'Grippy walking shoes', done: false, kind: 'pack' },
        { tripId: trip?.id, phase: 'prepare', text: 'Type F plug adapter', done: false, kind: 'pack' },
      ],
    }
  }

  if (has(p, 'delay', 'cancel', 'missed', 'late')) {
    return {
      text: 'If your flight slips, I\'d do three things: let the guesthouse know your new arrival time, push the airport transfer, and check whether you\'re owed EU261 compensation. Want Fo to email the guesthouse now?',
      action: {
        tripId: trip?.id,
        title: 'Tell the guesthouse we\'re delayed',
        channel: 'email',
        recipient: { name: 'Casa do Largo', contact: 'reservas@casadolargo.example' },
        script: 'Olá! Our flight is delayed by about 3 hours, so we\'ll now arrive around 3pm on Nov 7. Please hold our room (CDL-48213). Obrigada!',
        dataShared: ['Booking ref CDL-48213', 'New arrival time'],
        cost: 'Free',
        risk: 'low',
        plan: [
          { text: 'Fo drafted the update' },
          { text: 'Sent from your email account' },
          { text: 'Host replied: "No problem, see you at 3!"' },
        ],
        outcomeKey: 'delay',
        checklistItemId,
      },
    }
  }

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
      plan: [
        { text: 'Fo received the request' },
        { text: 'Fo is working on it…' },
        { text: 'Fo finished and reported back' },
      ],
      outcomeKey: 'generic',
      checklistItemId,
    },
  }
}

export function outcome(key: string | undefined, answers: string[]): Outcome | 'cancelled' {
  switch (key) {
    case 'checkin':
      return {
        summary: 'Early check-in confirmed from noon. Airport transfer quoted at €35, pay the driver.',
        evidence: ['Email reply: "Re: Booking CDL-48213 – early arrival"', 'Transfer: €35, driver meets you at arrivals'],
        booking: { kind: 'transfer', title: 'Airport transfer → Casa do Largo', when: 'Sat Nov 7 · 11:45am', ref: 'CDL-48213-T', detail: '€35 · driver at arrivals', simulated: true },
      }
    case 'dinner': {
      const pick = answers[0] ?? '7:00pm Saturday'
      if (pick.startsWith('Neither')) return 'cancelled'
      const sunday = pick.includes('Sunday')
      return {
        summary: `Table for 2 booked at Horta da Graça, ${pick}. Tasting menu noted.`,
        evidence: [`Confirmation SMS: "Reserva confirmada · 2 pax · ${sunday ? 'Dom 20:30' : 'Sáb 19:00'}"`, 'Call summary: 2m 41s, host: Rita'],
        booking: { kind: 'dinner', title: 'Horta da Graça', when: sunday ? 'Sun Nov 9 · 8:30pm' : 'Sat Nov 8 · 7:00pm', ref: 'HG-0811', detail: 'Veg tasting · €55 pp', simulated: true },
      }
    }
    case 'delay':
      return { summary: 'The guesthouse knows you\'ll arrive around 3pm. Room held.', evidence: ['Email reply: "No problem, see you at 3!"'] }
    default:
      return { summary: 'Fo reported the task complete.', evidence: ['Fo conversation transcript (simulated)'] }
  }
}

export const SUGGESTIONS = [
  'Ask the guesthouse for early check-in',
  'Book a vegetarian dinner Saturday',
  'What should I pack?',
  'My flight is delayed 3 hours',
]
