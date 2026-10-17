import type { Booking, DetailsField, EmailDraft, Profile, StayDetails, StayIntent, Trip } from '../types'
import { fmtDay, fmtTime, isIsoDate, isTime } from './dates'

/*
 * Trip-aware stay emails (early check-in, delayed arrival). Everything comes
 * from the selected trip and profile. When something is missing, we return
 * the fields to ask for instead of guessing a contact, date, or time.
 */

const EMAIL = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[a-z]{2,}$/i
export const isEmail = (s: unknown): s is string => typeof s === 'string' && EMAIL.test(s.trim())

export const stayBooking = (trip: Trip): Booking | undefined => trip.bookings.find((b) => b.kind === 'stay')

/** What we already know about the stay, from the trip. */
export function knownStay(trip: Trip): StayDetails {
  const b = stayBooking(trip)
  const arrival = trip.arrival?.split('T')
  return {
    hotelName: b?.title,
    hotelEmail: b?.contact,
    checkIn: b?.checkIn ?? (arrival && isIsoDate(arrival[0]) ? arrival[0] : undefined),
    arrivalTime: arrival && isTime(arrival[1]) ? arrival[1] : undefined,
    ref: b?.ref,
  }
}

export function missingFields(trip: Trip, d: StayDetails): DetailsField[] {
  const f: DetailsField[] = []
  if (!d.hotelName?.trim()) f.push({ key: 'hotelName', label: 'Where are you staying?', type: 'text', required: true, placeholder: 'hotel or host name' })
  if (!isEmail(d.hotelEmail)) f.push({ key: 'hotelEmail', label: 'Their email address', type: 'email', required: true, placeholder: 'from your booking confirmation' })
  if (!isIsoDate(d.checkIn) || d.checkIn < trip.start || d.checkIn > trip.end)
    f.push({ key: 'checkIn', label: 'Check-in date', type: 'date', required: true })
  if (!isTime(d.arrivalTime)) f.push({ key: 'arrivalTime', label: 'When do you expect to arrive?', type: 'time', required: true })
  // Offer the optional reference only alongside required questions.
  if (!d.ref?.trim() && f.length) f.push({ key: 'ref', label: 'Booking reference (optional)', type: 'text', required: false })
  return f
}

/** Only the fields that block drafting. The optional reference never blocks. */
export const blockingFields = (trip: Trip, d: StayDetails) => missingFields(trip, d).filter((f) => f.required)

export function draftStayEmail(
  intent: StayIntent,
  trip: Trip,
  profile: Profile,
  d: Required<Pick<StayDetails, 'hotelName' | 'hotelEmail' | 'checkIn' | 'arrivalTime'>> & Pick<StayDetails, 'ref'>,
  transferQuote: boolean,
): EmailDraft {
  const guests = `${trip.travelers} ${trip.travelers === 1 ? 'guest' : 'guests'}`
  const day = fmtDay(d.checkIn)
  const ref = d.ref?.trim()
  const refText = ref ? ` (booking ${ref})` : ''
  const sign = profile.name.trim() || 'Your guest'
  const stay = stayBooking(trip)
  const leaving = stay?.checkOut && isIsoDate(stay.checkOut) ? `, staying until ${fmtDay(stay.checkOut)}` : ''

  const body =
    intent === 'early_checkin'
      ? [
          `Hello ${d.hotelName} team,`,
          '',
          `We have a reservation${refText} for ${guests}, checking in on ${day}${leaving}. We expect to arrive around ${fmtTime(d.arrivalTime)}. Would an early check-in be possible?`,
          ...(transferQuote
            ? ['', `Could you also send a price quote for a private airport transfer for ${trip.travelers === 1 ? 'one person' : `${trip.travelers} people`}? We're only asking for a quote for now, not booking it.`]
            : []),
          '',
          'Thank you,',
          sign,
        ].join('\n')
      : [
          `Hello ${d.hotelName} team,`,
          '',
          `We have a reservation${refText} for ${guests}, checking in on ${day}. Our travel is delayed and we now expect to arrive around ${fmtTime(d.arrivalTime)}. Please keep our reservation.`,
          '',
          'Thank you,',
          sign,
        ].join('\n')

  return {
    intent,
    to: d.hotelEmail.trim(),
    toName: d.hotelName.trim(),
    subject: `${intent === 'early_checkin' ? 'Early check-in request' : 'Late arrival'} · ${day}${ref ? ` · ${ref}` : ''}`,
    body,
    transferQuote: intent === 'early_checkin' && transferQuote,
  }
}

export const sharedData = (trip: Trip, profile: Profile, ref?: string) =>
  [profile.name.trim() ? 'Your name' : '', ref ? `Booking ref ${ref}` : '', 'Check-in date', 'Arrival time', `${trip.travelers} ${trip.travelers === 1 ? 'guest' : 'guests'}`].filter(Boolean)

/** "delayed 3 hours" / "3h late" → new arrival time, when the original is known. */
export function shiftedArrival(prompt: string, arrivalTime?: string): string | undefined {
  const m = prompt.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i)
  if (!m || !isTime(arrivalTime)) return undefined
  const [h, min] = arrivalTime.split(':').map(Number)
  const total = h * 60 + min + Math.round(parseFloat(m[1]) * 60)
  if (total >= 24 * 60) return undefined // crosses midnight: ask instead of guessing the date
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
