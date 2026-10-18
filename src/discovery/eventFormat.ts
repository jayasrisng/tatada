// Display helpers for event listings from Tatada's events service (server/events).
export type EventPrice = { kind: 'free' } | { kind: 'paid'; label: string } | { kind: 'unknown' }
export interface EventItem {
  id: string
  title: string
  start: string
  end?: string
  timezone: string
  venue?: string
  city?: string
  distanceKm?: number
  approximateDistance?: boolean
  price: EventPrice
  sources: { source: string; label: string; url: string }[]
  reasons: string[]
  tags: string[]
}
export interface EventSource { source: string; label: string; state: 'ok' | 'empty' | 'failed' | 'not_covered'; count: number; note?: string; stale?: boolean; checkedAt?: string }
export interface EventSearch { events: EventItem[]; sources: EventSource[]; interests: string[]; relaxed: boolean; location?: string }

const fmt = (iso: string, timeZone: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone, ...options }).format(new Date(iso))
const zoneName = (iso: string, timeZone: string) => new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(new Date(iso)).find((p) => p.type === 'timeZoneName')?.value ?? timeZone

/** "Sat, Oct 18 · 8:00–11:00 PM PDT", always in the event's own time zone. */
export function formatEventTime(e: Pick<EventItem, 'start' | 'end' | 'timezone'>) {
  const day = (iso: string) => fmt(iso, e.timezone, { weekday: 'short', month: 'short', day: 'numeric' })
  const time = (iso: string) => fmt(iso, e.timezone, { hour: 'numeric', minute: '2-digit' })
  const zone = zoneName(e.start, e.timezone)
  if (!e.end) return `${day(e.start)} · ${time(e.start)} ${zone}`
  // Same-day and overnight listings show the end time; multi-day ones the end date.
  return day(e.end) === day(e.start) || Date.parse(e.end) - Date.parse(e.start) < 18 * 3_600_000 ? `${day(e.start)} · ${time(e.start)}–${time(e.end)} ${zone}` : `${day(e.start)} · ${time(e.start)} ${zone} – ${day(e.end)}`
}

export function formatPrice(p: EventPrice) {
  return p.kind === 'free' ? 'Free' : p.kind === 'paid' ? p.label : 'Price not listed'
}

export function eventPlaceLine(e: EventItem) {
  const km = e.distanceKm === undefined ? undefined : `${e.approximateDistance ? 'about ' : ''}${e.distanceKm < 1 ? `${Math.round(e.distanceKm * 1000 / 50) * 50} m` : `${e.distanceKm} km`}`
  return [e.venue, e.city, km].filter(Boolean).join(' · ')
}

/** Checklist text for a saved event; the note keeps the original source link. */
export const eventSaveText = (e: EventItem) => `${e.title} · ${formatEventTime(e)}`

export const ago = (iso: string, now = Date.now()) => {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000))
  return min < 2 ? 'just now' : min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`
}

/** One short line summarising coverage, e.g. "Luma 12 · Eventbrite 5 (from 1 h ago) · Partiful didn't answer". */
export function sourceSummary(sources: EventSource[], now = Date.now()) {
  return sources.map((s) => {
    const state = s.state === 'ok' ? `${s.count}` : s.state === 'empty' ? '0' : s.state === 'failed' ? "didn't answer" : 'not available here'
    return `${s.label} ${state}${s.stale && s.checkedAt ? ` (from ${ago(s.checkedAt, now)})` : ''}`
  }).join(' · ')
}

/** "Checked just now" / "Checked 8 min ago", from the oldest source that answered. */
export function checkedLine(sources: EventSource[], now = Date.now()) {
  const times = sources.flatMap((s) => s.checkedAt && (s.state === 'ok' || s.state === 'empty') ? [s.checkedAt] : []).sort()
  return times.length ? `Checked ${ago(times[0], now)}` : ''
}
