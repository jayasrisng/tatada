/*
 * Event search across public sources. Each source fails independently; the
 * response always says which sources answered, which failed and which do not
 * cover the location.
 */
import { createFetcher, UpstreamError, type Fetcher } from './fetch.ts'
import { distanceKm, parseInterests, rankEvents } from './aggregate.ts'
import { PARTIFUL_REGIONS, eventbritePlace, eventbriteUrl, lumaUrl, parseEventbrite, parseLuma, parsePartiful, partifulUrl } from './sources.ts'
import { SOURCE_LABEL, type EventQuery, type EventSearchResponse, type RawEvent, type SourceId, type SourceStatus, type When } from './types.ts'

const WHEN: When[] = ['any', 'today', 'tomorrow', 'weekend', 'week']

/** Validates untrusted query parameters. Returns an error message for bad input. */
export function parseQuery(params: URLSearchParams): EventQuery | string {
  const lat = Number(params.get('lat')), lon = Number(params.get('lon'))
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return 'Choose a valid location first.'
  const text = (name: string, max = 80) => { const v = params.get(name)?.trim(); return v ? v.slice(0, max) : undefined }
  const when = params.get('when') as When
  return {
    lat, lon, city: text('city'), region: text('region'), country: text('country'), countryCode: text('cc', 2),
    q: text('q', 200) ?? '', when: WHEN.includes(when) ? when : 'any', freeOnly: params.get('free') === '1',
  }
}

interface Place { city?: string; region?: string; country?: string; countryCode?: string }

async function reversePlace(q: EventQuery, fetcher: Fetcher): Promise<Place> {
  if (q.city) return q
  try {
    const data = JSON.parse((await fetcher(`https://photon.komoot.io/reverse?lat=${q.lat.toFixed(3)}&lon=${q.lon.toFixed(3)}&limit=1`)).body)
    const p = data?.features?.[0]?.properties ?? {}
    return { city: p.city ?? (p.type === 'city' ? p.name : undefined), region: p.state, country: p.country, countryCode: p.countrycode }
  } catch { return {} }
}

type SourceRun = { events: RawEvent[]; status: Omit<SourceStatus, 'count'>; fetchedAt?: number }
const failure = (source: SourceId, error: unknown): SourceRun => ({
  events: [], status: { source, label: SOURCE_LABEL[source], state: 'failed', note: error instanceof UpstreamError ? error.message : 'Listings could not be read; the page may have changed.' },
})

async function luma(q: EventQuery, fetcher: Fetcher, now: Date): Promise<SourceRun> {
  // Listings arrive soonest-first; read at most three pages, stopping past the window.
  const horizon = now.getTime() + ({ today: 1.2, tomorrow: 2.2, weekend: 7, week: 7, any: 30 }[q.when]) * 86_400_000
  const events: RawEvent[] = []
  let cursor: string | undefined, stale = false, fetchedAt = Infinity
  for (let page = 0; page < 3; page++) {
    const result = await fetcher(lumaUrl(q.lat, q.lon, cursor))
    stale ||= result.stale
    fetchedAt = Math.min(fetchedAt, result.fetchedAt)
    const parsed = parseLuma(result.body)
    events.push(...parsed.events)
    cursor = parsed.nextCursor
    if (!cursor || !parsed.events.length || Date.parse(parsed.events.at(-1)!.start) > horizon) break
  }
  return { events, status: { source: 'luma', label: 'Luma', state: 'ok', stale }, fetchedAt }
}

async function eventbrite(place: Place, interest: string | undefined, fetcher: Fetcher): Promise<SourceRun> {
  const slug = eventbritePlace(place.city, place.region, place.country, place.countryCode)
  if (!slug) return { events: [], status: { source: 'eventbrite', label: 'Eventbrite', state: 'not_covered', note: 'Could not match this location to an Eventbrite city page.' } }
  let events: RawEvent[] = [], stale = false, fetchedAt: number | undefined
  if (interest) {
    try { const r = await fetcher(eventbriteUrl(slug, interest)); events = parseEventbrite(r.body); stale = r.stale; fetchedAt = r.fetchedAt } catch { /* fall back to the city page */ }
  }
  if (!events.length) {
    try { const r = await fetcher(eventbriteUrl(slug)); events = parseEventbrite(r.body); stale = r.stale; fetchedAt = r.fetchedAt }
    catch (error) {
      if (error instanceof UpstreamError && error.status === 404) return { events: [], status: { source: 'eventbrite', label: 'Eventbrite', state: 'not_covered', note: `No Eventbrite city page for ${place.city}.` } }
      throw error
    }
  }
  return { events, status: { source: 'eventbrite', label: 'Eventbrite', state: 'ok', stale }, fetchedAt }
}

async function partiful(q: EventQuery, fetcher: Fetcher): Promise<SourceRun> {
  const nearest = Object.entries(PARTIFUL_REGIONS).map(([id, r]) => ({ id, km: distanceKm(q, r) })).sort((a, b) => a.km - b.km)[0]
  if (nearest.km > 80) return { events: [], status: { source: 'partiful', label: 'Partiful', state: 'not_covered', note: 'Partiful only publishes public listings for a few cities (SF, LA, NYC, Austin, Boston, Chicago, DC, Miami, London).' } }
  const r = await fetcher(partifulUrl(nearest.id))
  return { events: parsePartiful(r.body), status: { source: 'partiful', label: 'Partiful', state: 'ok', stale: r.stale }, fetchedAt: r.fetchedAt }
}

const defaultFetcher = createFetcher()
const withBudget = <T>(task: Promise<T>, ms: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new UpstreamError('Source timed out.')), ms) })
  return Promise.race([task, limit]).finally(() => clearTimeout(timer))
}

export async function searchEvents(q: EventQuery, fetcher: Fetcher = defaultFetcher, now = new Date()): Promise<EventSearchResponse> {
  const place = await withBudget(reversePlace(q, fetcher), 5_000).catch((): Place => ({}))
  const interests = parseInterests(q.q, place.city)
  const runs = await Promise.all([
    withBudget(luma(q, fetcher, now), 15_000).catch((e) => failure('luma', e)),
    withBudget(eventbrite(place, interests.terms[0], fetcher), 15_000).catch((e) => failure('eventbrite', e)),
    withBudget(partiful(q, fetcher), 15_000).catch((e) => failure('partiful', e)),
  ])
  const { events, relaxed } = rankEvents(runs.flatMap((r) => r.events), { origin: q, when: q.when, freeOnly: q.freeOnly, interests, now })
  const sources: SourceStatus[] = runs.map(({ status, fetchedAt }) => {
    const count = events.filter((e) => e.sources.some((s) => s.source === status.source)).length
    if (status.state !== 'ok') return { ...status, count }
    const checkedAt = fetchedAt !== undefined && Number.isFinite(fetchedAt) ? new Date(fetchedAt).toISOString() : undefined
    const noPrices = q.freeOnly && status.source !== 'luma'
    const note = status.stale ? "Couldn't refresh just now; showing the last listings Tatada read." : noPrices ? 'Prices are not shown on these pages, so the free filter hides them.' : undefined
    return { ...status, count, checkedAt, state: count ? 'ok' : 'empty', note }
  })
  return { events, sources, interests: interests.terms, relaxed, location: [place.city, place.region].filter(Boolean).join(', ') || undefined }
}
