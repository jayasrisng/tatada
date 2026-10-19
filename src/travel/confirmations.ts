import type { Booking } from '../types'
import type { ArrangementDraft } from './arrangements'
import { isIsoDate, isTime } from '../magic/dates'

export interface ConfirmationReview { draft: ArrangementDraft; warnings: string[] }
/** Conservative, local, labeled-field extraction. No invented dates, airports, references or provider actions. */
export function extractConfirmation(text: string): ConfirmationReview {
  if (!text.trim() || text.length > 150_000) throw new Error('Paste readable booking text up to 150,000 characters.')
  if (/\b(?:passport|visa)\s*(?:number|document|application)\b/i.test(text)) throw new Error('Keep passport and visa documents in your separate encrypted vault.')
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean)
  const warnings: string[] = []
  const read = (labels: string[], name: string) => {
    const re = new RegExp(`^(?:${labels.join('|')})\\s*[:=]\\s*(.+)$`, 'i')
    const values = [...new Set(lines.map(l => l.match(re)?.[1]?.trim()).filter((v): v is string => !!v))]
    if (values.length > 1) { warnings.push(`Multiple ${name} values: enter the right one.`); return '' }
    return values[0] ?? ''
  }
  const flightLabel=lines.some(l=>/^(?:flight(?: number)?|airline)\s*[:=]/i.test(l))
  const hotelLabel=lines.some(l=>/^(?:hotel(?: name)?|property|check[ -]?out(?: date)?)\s*[:=]/i.test(l))
  const kind: Booking['kind'] = flightLabel?'flight':hotelLabel?'stay':/\b(hotel|accommodation)\b/i.test(text)?'stay':/\b(flight|airline)\b/i.test(text)?'flight':'transfer'
  if(flightLabel&&hotelLabel)warnings.push('This document has more than one booking type. Review one record at a time; other details are not imported.')
  const validDate = (v: string, name: string) => {
    if (!v) return ''
    if (isIsoDate(v)) return v
    warnings.push(`${name} needs review; use YYYY-MM-DD.`); return ''
  }
  const validTime = (v: string, name: string) => {
    if (!v) return ''
    if (isTime(v)) return v
    warnings.push(`${name} needs review; use 24-hour local time.`); return ''
  }
  const date = validDate(read(kind === 'stay' ? ['check[ -]?in(?: date)?'] : ['departure date', 'date', 'pickup date'], 'date'), 'Date')
  const time = validTime(read(kind === 'stay' ? ['check[ -]?in time'] : ['departure time', 'time', 'pickup time'], 'time'), 'Time')
  const arrivalDate = validDate(read(['arrival date'], 'arrival date'), 'Arrival date')
  const arrivalTime = validTime(read(['arrival time'], 'arrival time'), 'Arrival time')
  const zone = (labels: string[], name: string) => {
    const v = read(labels, name)
    if (v && !validZone(v)) { warnings.push(`${name} needs an IANA zone, such as Europe/Paris.`); return '' }
    return v
  }
  const paidAmount=read(['paid total','total paid'],'paid total'),currency=read(['currency'],'currency').toUpperCase()
  const paidValid=/^\d{1,9}(?:\.\d{1,2})?$/.test(paidAmount)&&/^[A-Z]{3}$/.test(currency)
  if((paidAmount||currency)&&!paidValid)warnings.push('Paid total needs an amount and a currency; review manually.')
  const draft: ArrangementDraft = { paidAmount:paidValid?paidAmount:'',currency:paidValid?currency:'USD',kind, title: read(['hotel', 'hotel name', 'property', 'transport', 'operator', 'service'], 'name'), date, time,
    end: validDate(read(['check[ -]?out(?: date)?'], 'check-out'), 'Check-out'), ref: read(['confirmation(?: code| number)?', 'booking(?: reference| code| number)?', 'reference', 'pnr'], 'reference'),
    detail: '', contact: read(['contact email', 'email'], 'email'), airline: read(['airline'], 'airline'), number: read(['flight(?: number)?'], 'flight number'),
    from: read(['from', 'departure airport', 'origin', 'pickup'], 'departure'), to: read(['to', 'arrival airport', 'destination', 'drop[ -]?off'], 'destination'), sample: false,
    address: read(['address', 'hotel address', 'pickup address'], 'address'), arrival: arrivalDate && arrivalTime ? `${arrivalDate}T${arrivalTime}` : '',
    departureZone: zone(['departure (?:time ?zone|zone)'], 'Departure zone'), arrivalZone: zone(['arrival (?:time ?zone|zone)'], 'Arrival zone'),
  }
  if ((arrivalDate || arrivalTime) && !draft.arrival) warnings.push('Arrival needs both a date and a time; no same-day arrival was assumed.')
  warnings.push('Review every value. Unlabeled, ambiguous and unsupported details stay blank.')
  return { draft, warnings }
}
export function validZone(v: string): boolean {
  try { if (!v || !v.includes('/')) return v === 'UTC'; new Intl.DateTimeFormat('en', { timeZone: v }).format(); return true } catch { return false }
}
export async function confirmationHash(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource)), b => b.toString(16).padStart(2, '0')).join('')
}
/** Content hashes catch repeat files; complete references catch PDF/text imports of the same record. */
export function duplicateBooking(bookings: Booking[], draft: ArrangementDraft, hash: string) {
  return bookings.some(b => b.importHash === hash || (!!draft.ref.trim() && !!b.ref && b.ref.trim().toUpperCase() === draft.ref.trim().toUpperCase() && b.kind === draft.kind && (b.checkIn ?? b.at?.slice(0, 10)) === draft.date && (draft.kind !== 'flight' || (!!draft.number && b.flight?.number.replace(/\s/g, '').toUpperCase() === draft.number.replace(/\s/g, '').toUpperCase()))))
}
