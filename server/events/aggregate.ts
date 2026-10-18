/*
 * Pure merge/filter/rank logic for event listings. Every reason shown to the
 * user comes from a field a provider actually published.
 */
import { SOURCE_LABEL, type EventResult, type RawEvent, type When } from './types.ts'
import { addDays, zonedParts } from './time.ts'

const CATEGORIES: Record<string, string[]> = {
  music: ['music', 'concert', 'gig', 'live music', 'band', 'jazz', 'dj', 'techno', 'house music', 'hip hop', 'r&b', 'orchestra', 'choir', 'open mic', 'karaoke', 'vinyl'],
  tech: ['tech', 'ai', 'startup', 'founder', 'founders', 'hackathon', 'developer', 'developers', 'coding', 'engineering', 'demo day', 'product'],
  food: ['food', 'dinner', 'supper', 'brunch', 'tasting', 'wine', 'beer', 'cocktail', 'coffee', 'cooking', 'pop-up', 'popup', 'market', 'dumpling', 'dumplings', 'food & drink'],
  art: ['art', 'arts', 'gallery', 'exhibition', 'museum', 'studio', 'open studios', 'film', 'cinema', 'screening', 'craft', 'design', 'photography', 'fashion', 'performing & visual arts'],
  outdoors: ['outdoor', 'outdoors', 'hike', 'hiking', 'run', 'running', 'run club', 'walk', 'bike', 'cycling', 'park', 'beach', 'sports & fitness'],
  wellness: ['wellness', 'yoga', 'meditation', 'pilates', 'sound bath', 'breathwork', 'fitness', 'health'],
  nightlife: ['party', 'parties', 'club', 'nightlife', 'dance', 'dancing', 'rave', 'halloween', 'night'],
  comedy: ['comedy', 'stand-up', 'standup', 'improv'],
  community: ['community', 'volunteer', 'meetup', 'social', 'networking', 'book club', 'game night', 'games', 'trivia', 'chess', 'mahjong', 'swap'],
  family: ['family', 'kids', 'children', 'family & education'],
  learning: ['talk', 'lecture', 'panel', 'class', 'workshop', 'conference', 'seminar'],
}
const ALIASES: Record<string, string> = { concerts: 'music', 'live-music': 'music', parties: 'nightlife', clubs: 'nightlife', hikes: 'outdoors', outside: 'outdoors', meetups: 'community', workshops: 'learning', talks: 'learning', exhibitions: 'art', galleries: 'art', shows: 'music' }
const FILLER = new Set('a an and any are around at best can cheap close cool do event events find for free fun get going good happen happening happens have help i in is it its like live local looking me near nearby next nice now of on or please public see show some something soon stuff that the things this to today tomorrow tonight upcoming want we week weekend what whats where with would you your'.split(' '))

export interface Interests { terms: string[]; patterns: { term: string; words: string[] }[] }

export function parseInterests(q: string, place?: string): Interests {
  const placeWords = new Set((place ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))
  const text = q.toLowerCase().replace(/[’']/g, '').replace(/this weekend|next week|this week|right now|near me|close by|things to do/g, ' ')
  const terms: string[] = []
  for (const name of Object.keys(CATEGORIES)) if (new RegExp(`\\b${name}\\b`).test(text)) terms.push(name)
  for (const raw of text.split(/[^a-z0-9&+-]+/)) {
    const word = ALIASES[raw] ?? raw
    if (word.length < 2 || FILLER.has(word) || placeWords.has(word) || /^\d+$/.test(word) || terms.includes(word)) continue
    terms.push(word)
  }
  const patterns = terms.slice(0, 5).map((term) => ({ term, words: CATEGORIES[term] ?? [term, ...(term.endsWith('s') && term.length > 3 ? [term.slice(0, -1)] : [`${term}s`])] }))
  return { terms: patterns.map((p) => p.term), patterns }
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const hasWord = (text: string, word: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(word)}($|[^\\p{L}\\p{N}])`, 'iu').test(text)

/** Scores how well an event matches the interests and explains it in words. */
export function interestMatch(e: RawEvent, interests: Interests) {
  let score = 0
  const reasons: string[] = []
  for (const { term, words } of interests.patterns) {
    const inTitle = words.find((w) => hasWord(e.title, w))
    const inTag = !inTitle && e.tags.find((t) => words.some((w) => hasWord(t, w)))
    const inText = !inTitle && !inTag && words.find((w) => hasWord(`${e.description ?? ''} ${e.organizer ?? ''}`, w))
    if (inTitle) { score += 2; reasons.push(inTitle.toLowerCase() === term ? `“${inTitle}” is in the title` : `${term}: “${inTitle}” in the title`) }
    else if (inTag) { score += 1.5; reasons.push(`Listed under ${inTag}`) }
    else if (inText) { score += 1; reasons.push(`Description mentions “${inText}”`) }
  }
  return { score, reasons }
}

/** Is the event inside the requested window, judged in the event's own time zone? */
export function inWindow(e: RawEvent, when: When, now: Date): boolean {
  const start = new Date(e.start), local = zonedParts(start, e.timezone), today = zonedParts(now, e.timezone)
  const ongoing = start <= now && !!e.end && new Date(e.end) > now
  switch (when) {
    case 'today': return local.date === today.date || ongoing
    case 'tomorrow': return local.date === addDays(today.date, 1)
    case 'week': return start.getTime() - now.getTime() <= 7 * 86_400_000 || ongoing
    case 'weekend': {
      // Friday 5 PM through Sunday, this weekend or the next one if it is Mon–Thu.
      const toFriday = today.weekday === 0 ? -2 : today.weekday === 6 ? -1 : 5 - today.weekday
      const friday = addDays(today.date, toFriday), sunday = addDays(friday, 2)
      if (ongoing && today.weekday % 6 === 0) return true
      return (local.date === friday && local.minutes >= 17 * 60) || (local.date > friday && local.date <= sunday)
    }
    default: return start.getTime() - now.getTime() <= 60 * 86_400_000 || ongoing
  }
}

/** Excludes past, canceled, clearly sold-out and online-only listings. */
export function isAvailable(e: RawEvent, now: Date) {
  if (e.canceled || e.soldOut || e.online || /^\W*(cancel+ed|postponed)\b/i.test(e.title)) return false
  // Without a listed end time, a started event cannot be confirmed as still running.
  return e.end ? new Date(e.end) > now : new Date(e.start) > now
}

export const distanceKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const rad = (v: number) => v * Math.PI / 180
  const d = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(d), Math.sqrt(Math.max(0, 1 - d)))
}

export const normalizeTitle = (t: string) => t.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(presents?|the|a|an|and|w\/|with|at|@)\b/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

const sameEvent = (a: RawEvent, b: RawEvent) => {
  if (Math.abs(Date.parse(a.start) - Date.parse(b.start)) > 90 * 60_000) return false
  const ta = normalizeTitle(a.title), tb = normalizeTitle(b.title)
  const titles = ta === tb || (Math.min(ta.length, tb.length) >= 12 && (ta.includes(tb) || tb.includes(ta)))
  if (!titles) return false
  if (a.lat !== undefined && a.lon !== undefined && b.lat !== undefined && b.lon !== undefined) return distanceKm({ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }) < 3
  return true
}
const detail = (e: RawEvent) => Number(!e.approximateLocation && e.lat !== undefined) * 2 + Number(e.price.kind !== 'unknown') * 2 + Number(!!e.end) + Number(!!e.venue)

/** Merges cross-posted and repeated listings, keeping the most detailed copy and every source link. */
export function dedupe(events: RawEvent[]): { event: RawEvent; sources: RawEvent[] }[] {
  const groups: { event: RawEvent; sources: RawEvent[] }[] = []
  for (const e of events) {
    const group = groups.find((g) => g.sources.some((s) => (s.source === e.source && s.sourceId === e.sourceId) || sameEvent(s, e)))
    if (!group) { groups.push({ event: e, sources: [e] }); continue }
    if (!group.sources.some((s) => s.source === e.source && s.sourceId === e.sourceId)) group.sources.push(e)
    if (detail(e) > detail(group.event)) group.event = { ...e, price: e.price.kind === 'unknown' ? group.event.price : e.price }
    else if (group.event.price.kind === 'unknown' && e.price.kind !== 'unknown') group.event = { ...group.event, price: e.price }
  }
  return groups
}

export interface RankOptions { origin: { lat: number; lon: number }; when: When; freeOnly: boolean; interests: Interests; now: Date; maxKm?: number; limit?: number }

export function rankEvents(raw: RawEvent[], o: RankOptions): { events: EventResult[]; relaxed: boolean } {
  const maxKm = o.maxKm ?? 80
  const candidates = dedupe(raw).flatMap(({ event: e, sources }) => {
    if (!isAvailable(e, o.now) || !inWindow(e, o.when, o.now)) return []
    if (o.freeOnly && e.price.kind !== 'free') return []
    const km = e.lat !== undefined && e.lon !== undefined ? distanceKm(o.origin, { lat: e.lat, lon: e.lon }) : undefined
    if (km !== undefined && km > maxKm) return []
    // Merge tags/descriptions from every copy so a match on any source counts.
    const merged: RawEvent = { ...e, tags: [...new Set(sources.flatMap((s) => s.tags))], description: sources.map((s) => s.description).filter(Boolean).join(' ') || undefined }
    return [{ e, sources, km, match: interestMatch(merged, o.interests) }]
  })
  const wanted = o.interests.patterns.length > 0
  const matching = wanted ? candidates.filter((c) => c.match.score > 0) : candidates
  const relaxed = wanted && matching.length === 0
  const pool = relaxed ? candidates : matching
  const daysAway = (e: RawEvent) => Math.max(0, (Date.parse(e.start) - o.now.getTime()) / 86_400_000)
  const scored = pool.map((c) => ({ ...c, score: c.match.score * 1.5 - (c.km ?? 25) * 0.06 - daysAway(c.e) * 0.2 + (c.e.price.kind === 'free' ? 0.2 : 0) }))
  scored.sort((a, b) => b.score - a.score || Date.parse(a.e.start) - Date.parse(b.e.start))
  const events = scored.slice(0, o.limit ?? 40).map(({ e, sources, km, match }): EventResult => {
    const reasons = [...match.reasons.slice(0, 2)]
    if (o.when === 'today' || o.when === 'tomorrow' || o.when === 'weekend') reasons.push({ today: 'Happening today', tomorrow: 'Happening tomorrow', weekend: 'This weekend' }[o.when])
    if (e.price.kind === 'free') reasons.push('Free admission listed')
    if (km !== undefined && km < 2 && !e.approximateLocation) reasons.push('Under 2 km away (straight line)')
    if (sources.length > 1) reasons.push(`Listed on ${[...new Set(sources.map((s) => SOURCE_LABEL[s.source]))].join(' and ')}`)
    return {
      id: `${e.source}:${e.sourceId}`, title: e.title, start: e.start, end: e.end, timezone: e.timezone, venue: e.venue, city: e.city,
      distanceKm: km === undefined ? undefined : Math.round(km * 10) / 10, approximateDistance: km === undefined ? undefined : !!e.approximateLocation,
      price: e.price, sources: sources.map((s) => ({ source: s.source, label: SOURCE_LABEL[s.source], url: s.url })), reasons: reasons.slice(0, 3), tags: e.tags.slice(0, 4),
    }
  })
  return { events, relaxed }
}
