/*
 * Parsers for public, unauthenticated event listings. Each takes the raw body
 * a source returned and yields normalized events; anything unparseable is
 * skipped rather than guessed.
 *
 * Luma:       api.lu.ma/discover/get-paginated-events (JSON behind luma.com/discover)
 * Eventbrite: eventbrite.com/d/<place>/... browse pages (window.__SERVER_DATA__)
 * Partiful:   partiful.com/explore/<region> public explore pages (__NEXT_DATA__)
 */
import type { Price, RawEvent } from './types.ts'
import { validTimeZone, zonedToUtc } from './time.ts'

type Json = Record<string, any>
const str = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : undefined
const num = (v: unknown) => { const n = typeof v === 'string' ? Number(v) : v; return typeof n === 'number' && Number.isFinite(n) ? n : undefined }
const iso = (v: unknown) => { const s = str(v); const t = s ? Date.parse(s) : NaN; return Number.isFinite(t) ? new Date(t).toISOString() : undefined }
const canceledTitle = (title: string) => /^\W*(cancel+ed|postponed)\b/i.test(title)

function money(cents: number, currency?: string) {
  const amount = cents / 100
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: (currency ?? 'usd').toUpperCase(), maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount) }
  catch { return `${amount} ${currency ?? ''}`.trim() }
}

/* ── Luma ── */
// Coordinates are snapped to a ~2 km grid: nearby searches share one cached
// upstream page, and arbitrary coordinates can't bypass the cache.
const snap = (v: number) => (Math.round(v * 50) / 50).toFixed(2)
export const lumaUrl = (lat: number, lon: number, cursor?: string) =>
  `https://api.lu.ma/discover/get-paginated-events?latitude=${snap(lat)}&longitude=${snap(lon)}&pagination_limit=50${cursor ? `&pagination_cursor=${encodeURIComponent(cursor)}` : ''}`

export function parseLuma(body: string): { events: RawEvent[]; nextCursor?: string } {
  const data = JSON.parse(body) as Json
  if (!Array.isArray(data?.entries)) throw new Error('Unexpected Luma response')
  const events = data.entries.flatMap((entry: Json): RawEvent[] => {
    const e = entry?.event ?? {}, ticket = entry?.ticket_info ?? {}
    const title = str(e.name), start = iso(e.start_at ?? entry.start_at), slug = str(e.url)
    if (!title || !start || !slug || !validTimeZone(e.timezone)) return []
    if (e.visibility && e.visibility !== 'public') return []
    const geo = e.geo_address_info ?? {}
    let price: Price = { kind: 'unknown' }
    if (ticket.is_free === true) price = { kind: 'free' }
    else if (num(ticket.price?.cents) !== undefined) {
      const p = ticket.price, min = num(p.min_cents)
      price = { kind: 'paid', label: min !== undefined && min < p.cents ? `${min === 0 ? 'pay what you can, suggested' : `from ${money(min, p.currency)}, suggested`} ${money(p.cents, p.currency)}` : money(p.cents, p.currency) }
    }
    return [{
      source: 'luma', sourceId: str(e.api_id) ?? slug, title, url: `https://luma.com/${encodeURIComponent(slug)}`,
      start, end: iso(e.end_at), timezone: e.timezone,
      venue: geo.mode === 'obfuscated' ? str(geo.sublocality) : str(geo.address) ?? str(geo.sublocality),
      city: str(geo.city_state) ?? str(geo.city),
      lat: num(e.coordinate?.latitude), lon: num(e.coordinate?.longitude),
      approximateLocation: geo.mode === 'obfuscated',
      price, soldOut: ticket.is_sold_out === true, online: e.location_type === 'online' || e.location_type === 'zoom',
      canceled: canceledTitle(title), tags: [], organizer: str(entry.calendar?.name),
    }]
  })
  return { events, nextCursor: data.has_more ? str(data.next_cursor) : undefined }
}

/* ── Eventbrite ── */
const US_STATES: Record<string, string> = { alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar', california: 'ca', colorado: 'co', connecticut: 'ct', delaware: 'de', 'district of columbia': 'dc', florida: 'fl', georgia: 'ga', hawaii: 'hi', idaho: 'id', illinois: 'il', indiana: 'in', iowa: 'ia', kansas: 'ks', kentucky: 'ky', louisiana: 'la', maine: 'me', maryland: 'md', massachusetts: 'ma', michigan: 'mi', minnesota: 'mn', mississippi: 'ms', missouri: 'mo', montana: 'mt', nebraska: 'ne', nevada: 'nv', 'new hampshire': 'nh', 'new jersey': 'nj', 'new mexico': 'nm', 'new york': 'ny', 'north carolina': 'nc', 'north dakota': 'nd', ohio: 'oh', oklahoma: 'ok', oregon: 'or', pennsylvania: 'pa', 'rhode island': 'ri', 'south carolina': 'sc', 'south dakota': 'sd', tennessee: 'tn', texas: 'tx', utah: 'ut', vermont: 'vt', virginia: 'va', washington: 'wa', 'west virginia': 'wv', wisconsin: 'wi', wyoming: 'wy' }
const slug = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Eventbrite place slug, e.g. ca--san-francisco or portugal--lisbon. */
export function eventbritePlace(city?: string, region?: string, country?: string, countryCode?: string) {
  if (!city) return undefined
  const us = countryCode?.toUpperCase() === 'US' || /^united states/i.test(country ?? '')
  const prefix = us ? (region && (US_STATES[region.toLowerCase()] ?? (/^[a-z]{2}$/i.test(region) ? region.toLowerCase() : undefined))) : country && slug(country)
  return prefix && slug(city) ? `${prefix}--${slug(city)}` : undefined
}

/** Interest pages only for short plain words; anything else uses the city page. */
export const eventbriteUrl = (place: string, interest?: string) => {
  const word = interest && /^[a-z][a-z0-9-]{1,23}$/.test(slug(interest)) ? slug(interest) : undefined
  return `https://www.eventbrite.com/d/${place}/${word ? `${word}--events` : 'events'}/`
}

function serverData(html: string): Json {
  const marker = 'window.__SERVER_DATA__ = '
  const i = html.indexOf(marker)
  if (i < 0) throw new Error('Eventbrite page structure changed')
  const rest = html.slice(i + marker.length)
  const end = rest.search(/;\s*\n|;\s*<\/script>/)
  return JSON.parse(end < 0 ? rest : rest.slice(0, end))
}

export function parseEventbrite(html: string): RawEvent[] {
  const data = serverData(html)
  const found = new Map<string, Json>()
  const walk = (o: unknown, depth: number) => {
    if (!o || typeof o !== 'object' || depth > 8) return
    const e = o as Json
    if (str(e.start_date) && str(e.name) && str(e.url) && (str(e.eid) || str(e.id))) { found.set(str(e.eid) ?? str(e.id)!, e); return }
    for (const v of Object.values(e)) walk(v, depth + 1)
  }
  walk(data.search_data ?? data.buckets ?? data, 0)
  return [...found.values()].flatMap((e): RawEvent[] => {
    const timezone = str(e.timezone), title = str(e.name)!, url = str(e.url)!
    if (!timezone || !validTimeZone(timezone) || !/^https:\/\/www\.eventbrite\.[a-z.]+\/e\//.test(url) || e.hide_start_date) return []
    const start = str(e.start_time) ? zonedToUtc(e.start_date, e.start_time, timezone) : undefined
    if (!start) return []
    const end = str(e.end_date) && str(e.end_time) && !e.hide_end_date ? zonedToUtc(e.end_date, e.end_time, timezone) : undefined
    const venue = e.primary_venue ?? {}, address = venue.address ?? {}
    const tags = (Array.isArray(e.tags) ? e.tags : []).filter((t: Json) => ['EventbriteCategory', 'EventbriteSubCategory', 'EventbriteFormat'].includes(t?.prefix)).map((t: Json) => str(t.display_name)).filter(Boolean) as string[]
    return [{
      source: 'eventbrite', sourceId: str(e.eid) ?? str(e.id)!, title, url: url.split('?')[0],
      start: start.toISOString(), end: end?.toISOString(), timezone,
      venue: str(venue.name), city: str(address.localized_area_display) ?? str(address.city),
      lat: num(address.latitude), lon: num(address.longitude),
      // Browse pages carry no ticket prices or sold-out flags; both stay unknown.
      price: { kind: 'unknown' }, canceled: e.is_cancelled === true || canceledTitle(title), online: e.is_online_event === true,
      tags, description: str(e.summary),
    }]
  })
}

/* ── Partiful ── */
// Public explore pages exist for these metro areas only.
export const PARTIFUL_REGIONS: Record<string, { name: string; lat: number; lon: number }> = {
  sf: { name: 'San Francisco Bay Area', lat: 37.77, lon: -122.42 }, la: { name: 'Los Angeles', lat: 34.05, lon: -118.24 }, nyc: { name: 'New York', lat: 40.71, lon: -74.0 },
  atx: { name: 'Austin', lat: 30.27, lon: -97.74 }, bos: { name: 'Boston', lat: 42.36, lon: -71.06 }, chi: { name: 'Chicago', lat: 41.88, lon: -87.63 },
  dc: { name: 'Washington, DC', lat: 38.9, lon: -77.04 }, mia: { name: 'Miami', lat: 25.76, lon: -80.19 }, lon: { name: 'London', lat: 51.51, lon: -0.13 },
}
export const partifulUrl = (region: string) => `https://partiful.com/explore/${region}`

export function parsePartiful(html: string): RawEvent[] {
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)
  if (!m) throw new Error('Partiful page structure changed')
  const props = (JSON.parse(m[1]) as Json)?.props?.pageProps ?? {}
  const found = new Map<string, Json>()
  const walk = (o: unknown, depth: number) => {
    if (!o || typeof o !== 'object' || depth > 7) return
    const e = o as Json
    if (str(e.id) && str(e.title) && str(e.startDate)) { found.set(e.id, e); return }
    for (const v of Object.values(e)) walk(v, depth + 1)
  }
  walk(props, 0)
  return [...found.values()].flatMap((e): RawEvent[] => {
    const start = iso(e.startDate), title = str(e.title)!
    if (!start || !validTimeZone(e.timezone) || e.isPublic === false || !/^[A-Za-z0-9_-]+$/.test(e.id)) return []
    const maps = e.locationInfo?.mapsInfo ?? {}
    // Apple Maps links carry a rounded (~1 km) coordinate; good enough for "about" distances only.
    const sll = /[?&]sll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(str(maps.appleMapsUrl) ?? '')
    return [{
      source: 'partiful', sourceId: e.id, title, url: `https://partiful.com/e/${e.id}`,
      start, end: iso(e.endDate), timezone: e.timezone,
      venue: str(maps.name), city: str(maps.approximateLocation) ?? str(e.locationInfo?.neighborhood),
      lat: sll ? Number(sll[1]) : undefined, lon: sll ? Number(sll[2]) : undefined, approximateLocation: true,
      price: { kind: 'unknown' }, canceled: (str(e.status) ?? 'PUBLISHED') !== 'PUBLISHED' || canceledTitle(title),
      tags: [], description: str(e.description)?.slice(0, 600),
    }]
  })
}
