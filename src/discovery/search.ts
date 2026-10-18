import { rankPlaces, validPoint, type OSMElement, type PlacePreferences, type Point } from './places'
const cache = new Map<string, { at: number; value: unknown }>()
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const old = cache.get(url + (init?.body ?? ''))
  if (old && Date.now() - old.at < 15 * 60_000) return old.value as T
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) })
  if (!r.ok) throw new Error('The public map service is busy. Try again later or open Maps below.')
  const value = await r.json().catch(() => { throw new Error('The map provider returned an invalid response. Try again later or use Maps below.') })
  cache.set(url + (init?.body ?? ''), { at: Date.now(), value })
  return value
}
export async function findCity(query: string): Promise<{ name: string; point: Point }[]> {
  if (!query.trim() || query.length > 200) throw new Error('Enter a city or neighborhood.')
  const data = await request<{ features: { geometry: { coordinates: number[] }; properties: Record<string, string> }[] }>(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=3`)
  return data.features.flatMap((f) => { const [lon, lat] = f.geometry.coordinates; return validPoint({ lat, lon }) ? [{ point: { lat, lon }, name: [...new Set([f.properties.name, f.properties.city, f.properties.country].filter(Boolean))].join(', ') }] : [] })
}
interface PhotonFeature { geometry: { coordinates: number[] }; properties: { osm_type: string; osm_id: number; osm_key: string; osm_value: string; name?: string } }
async function nearbyFeatures(origin: Point, tag: string, radius: number): Promise<OSMElement[]> {
  const url = `https://photon.komoot.io/reverse?lat=${origin.lat}&lon=${origin.lon}&radius=${radius / 1000}&osm_tag=${encodeURIComponent(tag)}&limit=20`
  const result = await request<{ features: PhotonFeature[] }>(url)
  return result.features.flatMap((f) => {
    const [lon, lat] = f.geometry.coordinates
    const type = ({ N: 'node', W: 'way', R: 'relation' } as Record<string, string>)[f.properties.osm_type]
    return type && validPoint({ lat, lon }) ? [{ type, id: f.properties.osm_id, lat, lon, tags: { name: f.properties.name ?? '', [f.properties.osm_key]: f.properties.osm_value } }] : []
  })
}
export async function searchNearby(origin: Point, kind: 'coffee' | 'restaurants', prefs: PlacePreferences) {
  if (!validPoint(origin)) throw new Error('Choose a valid location first.')
  const radius = prefs.close ? 1000 : 3000
  const [places, parking, views] = await Promise.all([
    nearbyFeatures(origin, `amenity:${kind === 'coffee' ? 'cafe' : 'restaurant'}`, radius),
    prefs.parking ? nearbyFeatures(origin, 'amenity:parking', radius + 200).catch(() => []) : Promise.resolve([]),
    prefs.views ? nearbyFeatures(origin, 'tourism:viewpoint', radius + 200).catch(() => []) : Promise.resolve([]),
  ])
  // Fetch at most one small batched detail request per OSM element type.
  // Missing tags remain unknown; a detail-service failure never invents them.
  const details = await Promise.all(['node', 'way', 'relation'].map(async (type) => {
    const ids = places.filter((p) => p.type === type).map((p) => p.id)
    if (!ids.length) return []
    try { return (await request<{ elements: OSMElement[] }>(`https://www.openstreetmap.org/api/0.6/${type}s.json?${type}s=${ids.join(',')}`)).elements }
    catch { return [] }
  }))
  const tags = new Map(details.flat().map((p) => [`${p.type}/${p.id}`, p.tags]))
  return rankPlaces([...places.map((p) => ({ ...p, tags: { ...p.tags, ...tags.get(`${p.type}/${p.id}`) } })), ...parking, ...views], origin, kind, prefs)
}
