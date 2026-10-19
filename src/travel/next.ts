import type { Booking, JourneyStep, Trip } from '../types'
import { validZone } from './confirmations'
import { isIsoDate, isTime } from '../magic/dates'

export function localStamp(now: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const get = (key: string) => parts.find(p => p.type === key)?.value
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}
/** Reject skipped and repeated DST wall times: a precise schedule needs an unambiguous instant. */
export function localInstant(stamp: string, zone: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(stamp) || !isIsoDate(stamp.slice(0, 10)) || !isTime(stamp.slice(11)) || !validZone(zone)) return
  const center = Date.parse(stamp + ':00Z'), matches = new Set<number>()
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const wall = (at: number) => { const parts = formatter.formatToParts(new Date(at)); const p = (k: string) => parts.find(v => v.type === k)?.value; return `${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}` }
  // Offset candidates on both sides of a possible transition; supports quarter-hour zones too.
  for (const shift of [-36, -12, 0, 12, 36]) {
    const sample = center + shift * 3600000, offset = Date.parse(wall(sample) + ':00Z') - sample
    const candidate = center - offset
    if (wall(candidate) === stamp) matches.add(candidate)
  }
  return matches.size === 1 ? [...matches][0] : undefined
}
export interface NextTravelStep { id: string; title: string; when: string; zone?: string; address?: string; reference?: string; stage: JourneyStep; instant?: number; needsReview?: string; bookingId?: string }
export function destinationZone(trip: Trip) { return trip.timeZone || trip.bookings.find(b => b.kind === 'flight' && b.arrivalZone)?.arrivalZone }
export function nextTravelStep(trip: Trip, now = new Date()): NextTravelStep | undefined {
  const zone = destinationZone(trip), steps: NextTravelStep[] = []
  const flights = trip.bookings.filter(b => b.kind === 'flight').sort((a,b)=>(a.at??'').localeCompare(b.at??''))
  const add = (b: Booking, stage: JourneyStep, title: string, when: string | undefined, z: string | undefined) => {
    if (trip.journeyDone?.[stage] || !when) return
    const timed = when.includes('T'), instant = timed && z ? localInstant(when, z) : undefined
    steps.push({ id: `${b.id}-${title}`, bookingId: b.id, stage, title, when, zone: z, address: b.address ?? (b.kind === 'stay' ? trip.localAddress : undefined), reference: b.ref, instant,
      needsReview: timed && instant === undefined ? (z ? 'This local time is ambiguous or invalid. Check the saved date, time and zone.' : 'Add the time zone to compare this with the rest of your trip.') : !timed ? 'Time not saved. Check your confirmation.' : undefined })
  }
  for (const b of trip.bookings) {
    if (b.kind === 'flight') {
      const stage = flights[0]?.id === b.id ? 'flight' : 'onward'
      add(b, stage, `Flight · ${b.flight?.number || b.title}`, b.at, b.departureZone)
      if (stage==='flight'||!trip.journeyDone?.[stage]) add(b, stage === 'flight' ? 'arrival' : 'onward', `Arrive · ${b.flight?.to || b.title}`, b.arrivesAt, b.arrivalZone)
    } else if (b.kind === 'stay') add(b, 'stay', `Check in · ${b.title}`, b.checkIn ? b.checkIn + (b.at?.includes('T') ? b.at.slice(10) : '') : undefined, zone)
    else add(b, b.kind === 'transfer' ? 'arrival' : 'days', b.title, b.at, zone)
  }
  if (!trip.journeyDone?.days) for (const i of trip.itinerary ?? []) if (!i.done) {
    const when = i.day + (i.time ? 'T' + i.time : ''), instant = i.time && zone ? localInstant(when, zone) : undefined
    steps.push({ id: i.id, title: i.title, stage: 'days', when, zone, instant, needsReview: i.time && instant === undefined ? 'Add or check the destination time zone.' : undefined })
  }
  const destinationToday = zone && validZone(zone) ? localStamp(now, zone).slice(0,10) : undefined
  const future = steps.filter(s => s.instant !== undefined ? s.instant >= now.getTime() : destinationToday && s.when.slice(0,10) >= destinationToday)
  future.sort((a,b) => a.instant !== undefined && b.instant !== undefined ? a.instant - b.instant : a.when.slice(0,10).localeCompare(b.when.slice(0,10)) || Number(a.instant !== undefined) - Number(b.instant !== undefined))
  if (future[0]) return future[0]
  // A past schedule is not evidence of completion; leave it editable and ask the star to confirm.
  return steps.sort((a,b)=>b.when.localeCompare(a.when)).map(s => ({...s, needsReview:s.needsReview ?? 'Scheduled time has passed. Confirm or edit this stage when you’re ready.'}))[0]
}
