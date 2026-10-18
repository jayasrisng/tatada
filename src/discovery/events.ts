import type { EventSearch } from './eventFormat'
import type { EventWhen } from './places'
import type { Place } from './search'

// Same-origin in dev/preview (Vite mounts the service); another HTTPS origin can be set at build time.
const EVENTS_URL = (import.meta.env.VITE_EVENTS_URL as string | undefined)?.replace(/\/$/, '') || `${location.origin}/events-api`

export class EventsUnavailable extends Error {}

export async function searchEvents(place: Place, q: string, when: EventWhen, freeOnly: boolean): Promise<EventSearch> {
  const params = new URLSearchParams({ lat: place.point.lat.toFixed(4), lon: place.point.lon.toFixed(4), q, when, free: freeOnly ? '1' : '0' })
  for (const [k, v] of [['city', place.city], ['region', place.region], ['country', place.country], ['cc', place.countryCode]] as const) if (v) params.set(k, v)
  let r: Response
  try { r = await fetch(`${EVENTS_URL}/search?${params}`, { signal: AbortSignal.timeout(30_000) }) }
  catch { throw new EventsUnavailable("Tatada's events service didn't answer.") }
  const type = r.headers.get('content-type') ?? ''
  if (r.status === 404 || !type.includes('application/json')) throw new EventsUnavailable("Event listings need Tatada's events service, which isn't running for this site.")
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body.error ?? 'Event search failed. Try again shortly.')
  return body as EventSearch
}
