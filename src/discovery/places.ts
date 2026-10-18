export interface Point { lat: number; lon: number }
export interface NearbyPlace extends Point { id: string; name: string; tags: Record<string, string>; distance: number; parkingDistance?: number; viewDistance?: number }
export interface PlacePreferences { close: boolean; parking: boolean; views: boolean; vegetarian: boolean }
export function discoveryIntent(text: string, current: PlacePreferences) {
  const q = text.toLowerCase()
  const kind = /event|party|concert|meetup/.test(q) ? 'events' : /restaurant|dinner|lunch|food/.test(q) && !/coffee|caf[eé]/.test(q) ? 'restaurants' : 'coffee'
  const prefs = { ...current }
  if (/walk|near me|close by/.test(q)) prefs.close = true
  if (/parking/.test(q)) prefs.parking = !/no parking|without parking|don't need parking/.test(q)
  if (/view|scenic|sunset/.test(q)) prefs.views = !/no view|without a view/.test(q)
  if (/vegetarian|vegan/.test(q)) prefs.vegetarian = !/not vegetarian|not vegan/.test(q)
  return { kind: kind as 'coffee' | 'restaurants' | 'events', prefs }
}
export interface OSMElement { type: string; id: number; lat?: number; lon?: number; center?: Point; tags?: Record<string, string> }
export const distanceMeters = (a: Point, b: Point) => {
  const rad = (v: number) => v * Math.PI / 180
  const d = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(d), Math.sqrt(Math.max(0, 1 - d)))
}
export const validPoint = (p: Point) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180
const pointOf = (e: OSMElement): Point | undefined => e.lat !== undefined && e.lon !== undefined ? { lat: e.lat, lon: e.lon } : e.center
export function rankPlaces(elements: OSMElement[], origin: Point, kind: 'coffee' | 'restaurants', prefs: PlacePreferences): NearbyPlace[] {
  const related = (tag: string, value: string) => elements.filter((e) => e.tags?.[tag] === value).map(pointOf).filter((p): p is Point => !!p && validPoint(p))
  const parking = related('amenity', 'parking'), views = related('tourism', 'viewpoint')
  const nearest = (p: Point, options: Point[]) => options.length ? Math.min(...options.map((o) => distanceMeters(p, o))) : undefined
  const seen = new Set<string>()
  const scored = elements.flatMap((e) => {
    const p = pointOf(e), tags = e.tags ?? {}
    if (!p || !validPoint(p) || !tags.name || tags.amenity !== (kind === 'coffee' ? 'cafe' : 'restaurant')) return []
    const distance = distanceMeters(origin, p)
    if (distance > (prefs.close ? 1000 : 3000)) return []
    const identity = `${tags.name.toLowerCase()}:${p.lat.toFixed(3)}:${p.lon.toFixed(3)}`
    if (seen.has(identity)) return []
    seen.add(identity)
    const parkingDistance = nearest(p, parking), viewDistance = nearest(p, views)
    const vegetarian = ['yes', 'only'].includes(tags['diet:vegetarian']) || ['yes', 'only'].includes(tags['diet:vegan'])
    const reasons = Number(prefs.parking && parkingDistance !== undefined && parkingDistance < 200) * 3 + Number(prefs.views && viewDistance !== undefined && viewDistance < 200) * 3 + Number(prefs.vegetarian && vegetarian) * 4
    return [{ place: { ...p, id: `${e.type}/${e.id}`, name: tags.name, tags, distance, parkingDistance, viewDistance }, score: reasons - distance / 1500 }]
  })
  return scored.sort((a, b) => b.score - a.score).slice(0, 12).map((p) => p.place)
}
export const safeWebsite = (url?: string) => { try { const u = new URL(url ?? ''); return /^https?:$/.test(u.protocol) ? u.href : undefined } catch { return undefined } }
export function eventLinks(city: string, query: string) {
  return [['Partiful', 'partiful.com'], ['Luma', 'luma.com'], ['Eventbrite', 'eventbrite.com']].map(([label, domain]) => ({ label, url: `https://www.google.com/search?q=${encodeURIComponent(`${label === 'Luma' ? '(site:luma.com OR site:lu.ma)' : `site:${domain}`} events ${city} ${query}`)}` }))
}
