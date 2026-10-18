/*
 * Nearby place recommendations from OpenStreetMap data. Ranking uses only
 * tags that are actually mapped; anything missing stays unknown and is said
 * so in plain words. No ratings, walking times or availability are invented.
 */
import { openStatus, parseOpeningHours, type OpenStatus } from './hours'

export interface Point { lat: number; lon: number }
export type PlaceKind = 'coffee' | 'restaurants'
export type DiscoverKind = PlaceKind | 'events'
export type EventWhen = 'any' | 'today' | 'tomorrow' | 'weekend' | 'week'
export interface PlacePreferences { walk: boolean; parking: boolean; views: boolean; vegetarian: boolean; vegan: boolean; openNow: boolean; outdoor: boolean; wifi: boolean; cuisine?: string }
export const NO_PREFERENCES: PlacePreferences = { walk: false, parking: false, views: false, vegetarian: false, vegan: false, openNow: false, outdoor: false, wifi: false }

export interface Route { meters: number; minutes: number }
export interface NearbyPlace extends Point {
  id: string
  name: string
  tags: Record<string, string>
  /** Straight-line metres from the search origin. */
  distance: number
  /** Walking route from a routing service, when it answered. */
  walk?: Route
  open?: OpenStatus
  /** e.g. "Open until 6 PM"; only set when the venue's time zone and hours are reliable. */
  openLabel?: string
  /** Why this place fits the request; each line comes from mapped data. */
  reasons: string[]
  /** What is unknown or only nearby, kept for optional details. */
  notes: string[]
  score: number
}

const CUISINES = ['thai', 'indian', 'italian', 'mexican', 'japanese', 'sushi', 'chinese', 'korean', 'vietnamese', 'pizza', 'burger', 'ramen', 'french', 'mediterranean', 'greek', 'lebanese', 'middle eastern', 'ethiopian', 'spanish', 'tapas', 'seafood', 'portuguese', 'turkish', 'falafel', 'dim sum', 'noodle', 'bakery', 'brunch']
const negated = (q: string, word: string) => new RegExp(`(no|not|without|don'?t need|do not need|skip)\\s+(a\\s+|any\\s+)?(\\w+\\s+)?${word}`).test(q)

export interface DiscoveryIntent { kind: DiscoverKind; prefs: PlacePreferences; when: EventWhen; freeOnly: boolean; asksRatings: boolean }

/** Reads a plain request ("vegetarian dinner I'd enjoy, walkable") into explicit, editable preferences. */
export function discoveryIntent(text: string, defaults: PlacePreferences = NO_PREFERENCES, currentKind: DiscoverKind = 'coffee'): DiscoveryIntent {
  const q = text.toLowerCase().replace(/[’]/g, "'")
  const eventy = /\b(events?|party|parties|concerts?|gigs?|meetups?|shows?|festivals?|workshops?|hackathons?|comedy|things to do|what's on|whats on|exhibitions?|dj|live music)\b/.test(q)
  const food = /\b(restaurants?|dinner|lunch|food|eat|brunch|breakfast|bite|meal|cuisine)\b/.test(q) || CUISINES.some((c) => q.includes(c))
  const coffee = /\b(coffee|caf[eé]s?|espresso|latte|tea)\b/.test(q)
  const kind: DiscoverKind = eventy && !coffee ? 'events' : food && !coffee ? 'restaurants' : coffee ? 'coffee' : food ? 'restaurants' : eventy ? 'events' : currentKind
  const prefs = { ...defaults }
  const flag = (key: keyof Omit<PlacePreferences, 'cuisine'>, pattern: RegExp, word: string) => { if (pattern.test(q)) prefs[key] = !negated(q, word) }
  flag('walk', /\bwalk(able|ing)?\b|close enough|short walk|on foot/, 'walk')
  flag('parking', /\bparking\b|place to park|\bto park\b/, 'park')
  flag('views', /\bviews?\b|scenic|sunset|rooftop|overlook|skyline|waterfront/, 'view')
  flag('vegan', /\bvegan\b/, 'vegan')
  flag('vegetarian', /\bvegetarian|veggie|plant[- ]based|vegan\b/, 'vegetarian')
  flag('openNow', /open now|right now|open late|still open|\bopen\b/, 'open')
  flag('outdoor', /outdoor|outside|patio|terrace|garden seating/, 'outdoor')
  flag('wifi', /wi-?fi|laptop|work from|to work|internet/, 'wifi')
  const cuisine = CUISINES.find((c) => new RegExp(`\\b${c}`).test(q))
  if (cuisine && kind === 'restaurants') prefs.cuisine = cuisine
  const when: EventWhen = /\btonight|today\b/.test(q) ? 'today' : /\btomorrow\b/.test(q) ? 'tomorrow' : /\bweekend\b/.test(q) ? 'weekend' : /this week|next 7 days|next few days|\bweek\b/.test(q) ? 'week' : 'any'
  return { kind, prefs, when, freeOnly: /\bfree\b/.test(q) && !negated(q, 'free'), asksRatings: /\brat(ed|ings?)\b|reviews?|\bbest\b|enjoy|\bstars?\b|popular|top[- ]rated|good (food|coffee|place|spot|restaurant)/.test(q) }
}

export interface OSMElement { type: string; id: number; lat?: number; lon?: number; center?: Point; tags?: Record<string, string> }
export const distanceMeters = (a: Point, b: Point) => {
  const rad = (v: number) => v * Math.PI / 180
  const d = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(d), Math.sqrt(Math.max(0, 1 - d)))
}
export const validPoint = (p: Point) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180
const pointOf = (e: OSMElement): Point | undefined => e.lat !== undefined && e.lon !== undefined ? { lat: e.lat, lon: e.lon } : e.center

export const WALK_ROUTE_LIMIT = 1600, WALK_STRAIGHT_LIMIT = 1200, SEARCH_RADIUS = 3000
export const searchRadius = (prefs: PlacePreferences) => prefs.walk ? WALK_STRAIGHT_LIMIT + 100 : SEARCH_RADIUS

export const formatMinute = (m: number) => {
  const h = Math.floor(m / 60) % 24, min = m % 60
  return `${h % 12 || 12}${min ? `:${String(min).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`
}
export const formatDistance = (m: number) => m < 950 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`
const WEEKDAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export function describeOpen(s: OpenStatus, weekday: number) {
  if (s.state === 'open') return s.allDay ? 'Open 24 hours' : s.closesAt === undefined ? 'Open now' : `Open until ${formatMinute(s.closesAt)}`
  if (s.opensAt === undefined) return 'Closed now'
  return `Closed · opens ${s.inDays === 0 ? '' : s.inDays === 1 ? 'tomorrow ' : `${WEEKDAY[(weekday + s.inDays!) % 7]} `}${formatMinute(s.opensAt)}`
}

const listValue = (v?: string) => (v ?? '').toLowerCase().split(/\s*;\s*/).filter(Boolean)
const yes = (v?: string) => ['yes', 'only'].includes(v ?? '')
const PRIVATE_ACCESS = ['private', 'no', 'customers', 'permit', 'delivery', 'residents', 'employees']
const VIEW_WORDS = ['rooftop', 'roof', 'terrace', 'view', 'vista', 'panorama', 'skyline', 'overlook', 'miradouro', 'mirador', 'belvedere', 'sky']
const title = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export interface RankContext {
  /** Local time at a venue (0 = Monday), or undefined when its time zone is not reliably known. */
  timeAt?: (p: Point) => { weekday: number; minute: number; zone: string } | undefined
  routes?: Map<string, Route>
}

/**
 * Ranks mapped cafés/restaurants. `elements` may also contain parking lots and
 * viewpoints used only as nearby context, never as proof of a venue feature.
 */
export function rankPlaces(elements: OSMElement[], origin: Point, kind: PlaceKind, prefs: PlacePreferences, ctx: RankContext = {}): NearbyPlace[] {
  const lots = elements.filter((e) => e.tags?.amenity === 'parking').flatMap((e) => { const p = pointOf(e); return p && validPoint(p) ? [{ p, tags: e.tags! }] : [] })
  const viewpoints = elements.filter((e) => e.tags?.tourism === 'viewpoint').map(pointOf).filter((p): p is Point => !!p && validPoint(p))
  const seen = new Set<string>()
  const scored = elements.flatMap((e): NearbyPlace[] => {
    const p = pointOf(e), tags = e.tags ?? {}
    if (!p || !validPoint(p) || !tags.name || tags.amenity !== (kind === 'coffee' ? 'cafe' : 'restaurant')) return []
    const id = `${e.type}/${e.id}`
    const identity = `${tags.name.toLowerCase()}:${p.lat.toFixed(3)}:${p.lon.toFixed(3)}`
    if (seen.has(identity) || seen.has(id)) return []
    seen.add(identity); seen.add(id)
    const distance = distanceMeters(origin, p), walk = ctx.routes?.get(id)
    if (prefs.walk ? (walk ? walk.meters > WALK_ROUTE_LIMIT : distance > WALK_STRAIGHT_LIMIT) : distance > SEARCH_RADIUS) return []
    const reasons: string[] = [], notes: string[] = []
    let score = -(walk?.meters ?? distance * 1.25) / 1000

    // Diet: only explicit tags count; an explicit "no" excludes the place.
    const cuisines = listValue(tags.cuisine)
    if (prefs.vegan || prefs.vegetarian) {
      const veganTag = tags['diet:vegan'], vegTag = tags['diet:vegetarian']
      if (prefs.vegan && veganTag === 'no') return []
      if (!prefs.vegan && vegTag === 'no') return []
      if (prefs.vegan) {
        if (veganTag === 'only' || cuisines.includes('vegan')) { score += 4; reasons.push('Fully vegan (mapped)') }
        else if (veganTag === 'yes') { score += 3; reasons.push('Vegan options mapped') }
        else if (veganTag === 'limited') { score += 1; reasons.push('Limited vegan options mapped') }
        else notes.push('Vegan options are not listed; check the menu.')
      } else {
        if (vegTag === 'only' || veganTag === 'only' || cuisines.some((c) => c === 'vegetarian' || c === 'vegan')) { score += 4; reasons.push('Fully vegetarian (mapped)') }
        else if (yes(vegTag) || yes(veganTag)) { score += 3; reasons.push('Vegetarian options mapped') }
        else if (vegTag === 'limited') { score += 1; reasons.push('Limited vegetarian options mapped') }
        else notes.push('Vegetarian options are not listed; check the menu.')
      }
    }
    if (prefs.cuisine) {
      const c = prefs.cuisine
      if (cuisines.some((x) => x.replace(/_/g, ' ').includes(c))) { score += 3; reasons.push(`Mapped as ${title(c)}`) }
      else if (tags.name.toLowerCase().includes(c)) { score += 2; reasons.push(`“${title(c)}” in the name`) }
      else if (cuisines.length) return []
      else { score -= 1; notes.push('Cuisine is not listed.') }
    }

    // Parking: the venue's own tag is evidence; a nearby public lot is only context.
    if (prefs.parking) {
      const own = tags.parking ?? tags['parking:customers']
      const named = lots.find((l) => distanceMeters(p, l.p) < 150 && [l.tags.name, l.tags.operator].some((n) => n && n.toLowerCase().includes(tags.name.toLowerCase())))
      const nearest = lots.filter((l) => !PRIVATE_ACCESS.includes(l.tags.access ?? '')).map((l) => ({ ...l, m: distanceMeters(p, l.p) })).sort((a, b) => a.m - b.m)[0]
      if (own === 'no') { score -= 2; notes.push('Mapped as having no parking.') }
      else if (own) { score += 3; reasons.push('Parking listed for this place') }
      else if (named) { score += 3; reasons.push(`Customer parking mapped (${named.tags.name ?? named.tags.operator})`) }
      if (!own && !named && nearest && nearest.m <= 200) {
        score += 1.5
        const fee = nearest.tags.fee === 'no' ? 'free' : nearest.tags.fee === 'yes' ? 'paid' : 'fee unknown'
        reasons.push(`Public parking mapped ${formatDistance(nearest.m)} away (${fee}); spaces unknown`)
      } else if (!own && !named) notes.push('No parking information mapped nearby.')
    }

    // Views: venue tags or name are direct (if modest) evidence; a viewpoint nearby is not.
    if (prefs.views) {
      const words = new RegExp(`\\b(${VIEW_WORDS.join('|')})`, 'i')
      const nameHit = words.exec(tags.name), textHit = !nameHit && words.exec(tags.description ?? '')
      const hint = nameHit || textHit
      if (tags.rooftop === 'yes') { score += 3; reasons.push('Mapped as a rooftop venue') }
      else if (tags.view && tags.view !== 'no') { score += 3; reasons.push(`View mapped (${tags.view})`) }
      // A name like "Skyline Cafe" is only a hint; it never counts as a confirmed view.
      else if (hint) { score += 1; reasons.push(`“${hint[0]}” in its ${nameHit ? 'name' : 'description'}, a hint only; view not confirmed`) }
      const vp = viewpoints.length ? Math.min(...viewpoints.map((v) => distanceMeters(p, v))) : undefined
      if (vp !== undefined && vp <= 150) { score += 0.75; reasons.push(`Viewpoint mapped ${formatDistance(vp)} away; view from inside unknown`) }
      if (tags.outdoor_seating === 'yes' && !prefs.outdoor) { score += 0.5; notes.push('Outdoor seating is listed.') }
      if (!hint && !tags.view && tags.rooftop !== 'yes' && (vp === undefined || vp > 150)) notes.push('No view information mapped.')
    }
    if (prefs.outdoor) {
      if (tags.outdoor_seating === 'yes') { score += 2; reasons.push('Outdoor seating listed') }
      else if (tags.outdoor_seating === 'no') { score -= 2; notes.push('Mapped without outdoor seating.') }
      else notes.push('Outdoor seating is not listed.')
    }
    if (prefs.wifi) {
      const net = tags.internet_access
      if (net && net !== 'no') { score += 2; reasons.push(tags['internet_access:fee'] === 'no' ? 'Free Wi-Fi listed' : 'Wi-Fi listed') }
      else if (net === 'no') { score -= 2; notes.push('Mapped without Wi-Fi.') }
      else notes.push('Wi-Fi is not listed.')
    }

    // Hours: open/closed only when the hours parse and the venue's time zone is reliable.
    const hours = parseOpeningHours(tags.opening_hours), local = hours ? ctx.timeAt?.(p) : undefined
    let open: OpenStatus | undefined, openLabel: string | undefined
    if (hours && local) {
      open = openStatus(hours, local.weekday, local.minute)
      openLabel = describeOpen(open, local.weekday)
      if (open.state === 'closed') { if (prefs.openNow) return []; score -= 3 }
      else score += prefs.openNow ? 2 : 0.5
      notes.push(`${openLabel} is based on mapped hours (${local.zone.replace(/_/g, ' ')} time)${hours.holidayCaveat ? '; holiday hours may differ' : ''}.`)
    } else if (tags.opening_hours) {
      notes.push(`Listed hours: ${tags.opening_hours}`)
      if (prefs.openNow) score -= 0.5
    } else {
      notes.push('Opening hours are not listed.')
      if (prefs.openNow) score -= 0.5
    }

    if (!walk && (prefs.walk || distance < 2000)) notes.push(`${formatDistance(distance)} in a straight line; walking route not checked.`)
    return [{ ...p, id, name: tags.name, tags, distance, walk, open, openLabel, reasons, notes, score }]
  })
  return scored.sort((a, b) => b.score - a.score || a.distance - b.distance).slice(0, 10)
}

export const safeWebsite = (url?: string) => { try { const u = new URL(url ?? ''); return /^https?:$/.test(u.protocol) ? u.href : undefined } catch { return undefined } }

/** Search links shown only when Tatada's events service is unreachable. */
export function eventLinks(city: string, query: string) {
  return [['Partiful', 'partiful.com'], ['Luma', 'luma.com'], ['Eventbrite', 'eventbrite.com']].map(([label, domain]) => ({ label, url: `https://www.google.com/search?q=${encodeURIComponent(`${label === 'Luma' ? '(site:luma.com OR site:lu.ma)' : `site:${domain}`} events ${city} ${query}`)}` }))
}
