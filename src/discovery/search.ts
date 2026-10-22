import { rankPlaces, searchRadius, validPoint, type NearbyPlace, type OSMElement, type PlaceKind, type PlacePreferences, type Point, type Route } from './places'

const cache = new Map<string, { at: number; value: unknown }>()
async function request<T>(url: string, timeout = 12_000): Promise<T> {
  const old = cache.get(url)
  if (old && Date.now() - old.at < 15 * 60_000) return old.value as T
  const r = await fetch(url, { signal: AbortSignal.timeout(timeout) }).catch(() => { throw new Error('The map service did not answer. Try again in a moment.') })
  if (!r.ok) throw new Error('The public map service is busy. Try again later or open Maps below.')
  const value = await r.json().catch(() => { throw new Error('The map provider returned an invalid response. Try again later.') })
  cache.set(url, { at: Date.now(), value })
  return value
}

export interface Place { name: string; point: Point; city?: string; region?: string; country?: string; countryCode?: string; device?: boolean }
interface PhotonFeature { geometry: { coordinates: number[] }; properties: { osm_type: string; osm_id: number; osm_key: string; osm_value: string; name?: string; city?: string; state?: string; country?: string; countrycode?: string; type?: string } }

const placeOf = (f: PhotonFeature): Place | undefined => {
  const [lon, lat] = f.geometry.coordinates, p = f.properties
  if (!validPoint({ lat, lon })) return undefined
  const city = p.city ?? (['city', 'town', 'village'].includes(p.osm_value) || p.type === 'city' ? p.name : undefined)
  return { point: { lat, lon }, name: [...new Set([p.name, p.city, p.state, p.country].filter(Boolean))].join(', '), city, region: p.state, country: p.country, countryCode: p.countrycode }
}

export async function findCity(query: string): Promise<Place[]> {
  if (!query.trim() || query.length > 200) throw new Error('Enter a city or neighborhood.')
  // Photon ranks small towns named "Lisbon" above Lisboa; ask for cities separately and list them first.
  const q = encodeURIComponent(query.trim())
  const [cities, any] = await Promise.all([
    request<{ features: PhotonFeature[] }>(`https://photon.komoot.io/api/?q=${q}&limit=3&osm_tag=place:city`).catch(() => ({ features: [] })),
    request<{ features: PhotonFeature[] }>(`https://photon.komoot.io/api/?q=${q}&limit=5`),
  ])
  const seen = new Set<string>()
  return [...cities.features, ...any.features].map(placeOf).filter((p): p is Place => {
    if (!p || seen.has(p.name)) return false
    seen.add(p.name)
    return true
  }).slice(0, 4)
}

/** City/region for the device location, used for event city pages. Failure leaves it unknown. */
export async function describePoint(point: Point): Promise<Partial<Place>> {
  try {
    const data = await request<{ features: PhotonFeature[] }>(`https://photon.komoot.io/reverse?lat=${point.lat.toFixed(4)}&lon=${point.lon.toFixed(4)}&limit=1`)
    const p = data.features[0] ? placeOf(data.features[0]) : undefined
    return p ? { city: p.city, region: p.region, country: p.country, countryCode: p.countryCode } : {}
  } catch { return {} }
}

const elementOf = (f: PhotonFeature): OSMElement | undefined => {
  const [lon, lat] = f.geometry.coordinates
  const type = ({ N: 'node', W: 'way', R: 'relation' } as Record<string, string>)[f.properties.osm_type]
  return type && validPoint({ lat, lon }) ? { type, id: f.properties.osm_id, lat, lon, tags: { name: f.properties.name ?? '', [f.properties.osm_key]: f.properties.osm_value } } : undefined
}
async function nearby(origin: Point, tag: string, radius: number, limit = 50): Promise<OSMElement[]> {
  const result = await request<{ features: PhotonFeature[] }>(`https://photon.komoot.io/reverse?lat=${origin.lat}&lon=${origin.lon}&radius=${radius / 1000}&osm_tag=${encodeURIComponent(tag)}&limit=${limit}`)
  return result.features.map(elementOf).filter((e): e is OSMElement => !!e)
}
/** Name search near the origin (e.g. "vegan"), to reach places the nearest-50 list misses. */
async function named(origin: Point, words: string, tag: string): Promise<OSMElement[]> {
  const result = await request<{ features: PhotonFeature[] }>(`https://photon.komoot.io/api/?q=${encodeURIComponent(words)}&lat=${origin.lat}&lon=${origin.lon}&osm_tag=${encodeURIComponent(tag)}&limit=15&location_bias_scale=0.1&zoom=15`)
  return result.features.map(elementOf).filter((e): e is OSMElement => !!e)
}

/** Actual OSM tags (diet, hours, parking access/fee…) in at most one batched request per element type. */
async function withDetails(elements: OSMElement[]): Promise<OSMElement[]> {
  const details = await Promise.all(['node', 'way', 'relation'].map(async (type) => {
    const ids = [...new Set(elements.filter((p) => p.type === type).map((p) => p.id))].slice(0, 100)
    if (!ids.length) return []
    try { return (await request<{ elements: OSMElement[] }>(`https://www.openstreetmap.org/api/0.6/${type}s.json?${type}s=${ids.join(',')}`)).elements }
    catch { return [] } // Missing details stay unknown.
  }))
  const tags = new Map(details.flat().map((p) => [`${p.type}/${p.id}`, p.tags]))
  return elements.map((p) => ({ ...p, tags: { ...p.tags, ...tags.get(`${p.type}/${p.id}`) } }))
}

type RouteTable = { code: string; distances?: (number | null)[][]; durations?: (number | null)[][] }
/** Walking routes from the FOSSGIS OSRM foot profile; estimates, omitted when the service fails. */
let routeSlot = Promise.resolve()
let lastRouteAt = 0
/** FOSSGIS policy: at most one request per second. Requests queue and are spaced 1.1 s apart. */
const spaced = <T>(task: () => Promise<T>): Promise<T> => {
  const run = routeSlot.then(async () => {
    const wait = lastRouteAt + 1100 - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastRouteAt = Date.now()
  })
  routeSlot = run.catch(() => {})
  return run.then(task)
}

async function walkingRoutes(origin: Point, places: NearbyPlace[]): Promise<Map<string, Route>> {
  if (!places.length) return new Map()
  const coords = [origin, ...places].map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(';')
  try {
    const url = `https://routing.openstreetmap.de/routed-foot/table/v1/foot/${coords}?sources=0&annotations=distance,duration`
    const r = cache.has(url) ? await request<RouteTable>(url) : await spaced(() => request<RouteTable>(url, 20_000))
    const routes = new Map<string, Route>()
    places.forEach((p, i) => {
      const meters = r.distances?.[0]?.[i + 1], seconds = r.durations?.[0]?.[i + 1]
      if (r.code === 'Ok' && typeof meters === 'number' && typeof seconds === 'number' && meters > 0) routes.set(p.id, { meters, minutes: Math.max(1, Math.round(seconds / 60)) })
    })
    return routes
  } catch { return new Map() }
}


/**
 * Returns straight-line results at once. Walking routes (a throttled public
 * service) arrive later through `onRoutes`, which re-ranks with real routes.
 */
export async function searchNearby(location: Place, kind: PlaceKind, prefs: PlacePreferences, onRoutes?: (places: NearbyPlace[]) => void): Promise<NearbyPlace[]> {
  const origin = location.point
  if (!validPoint(origin)) throw new Error('Choose a valid location first.')
  const radius = searchRadius(prefs), tag = `amenity:${kind === 'coffee' ? 'cafe' : 'restaurant'}`
  const words = prefs.vegan ? 'vegan' : prefs.vegetarian ? 'vegetarian' : prefs.cuisine
  const [places, extra, parking, views] = await Promise.all([
    nearby(origin, tag, radius),
    words ? named(origin, words, tag).catch(() => []) : Promise.resolve([]),
    prefs.parking ? nearby(origin, 'amenity:parking', radius + 200, 40).catch(() => []) : Promise.resolve([]),
    prefs.views ? nearby(origin, 'tourism:viewpoint', radius + 200, 30).catch(() => []) : Promise.resolve([]),
  ])
  const detailed = await withDetails([...places, ...extra, ...parking])
  // Venue time zones come from coordinates, cross-checked (see zone.ts); unreliable zones make no open/closed claim.
  const now = new Date(), deviceZone = location.device ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined
  // The zone table (~75 kB) loads on first place search, not with the app.
  const venueTime = await import('./zone').then((m) => m.venueTime, () => undefined)
  const ctx = { timeAt: (p: Point) => venueTime?.(p, now, deviceZone) }
  const elements = [...detailed, ...views]
  const initial = rankPlaces(elements, origin, kind, prefs, ctx)
  if (onRoutes) {
    // Route the best candidates, including walk-mode ones just past the straight-line cut-off.
    const candidates = rankPlaces(elements, origin, kind, prefs.walk ? { ...prefs, walk: false } : prefs, ctx).filter((p) => p.distance < 2500)
    void walkingRoutes(origin, candidates).then((routes) => { if (routes.size) onRoutes(rankPlaces(elements, origin, kind, prefs, { ...ctx, routes })) })
  }
  return initial
}

export type EssentialKind='toilets'|'fuel'|'water'|'pharmacy'|'family'|'work'
export async function searchEssentials(origin:Point,kind:EssentialKind){
 if(!validPoint(origin))throw Error('Choose a location first.')
 const tags={toilets:'amenity:toilets',fuel:'amenity:fuel',water:'amenity:drinking_water',pharmacy:'amenity:pharmacy',work:'amenity:cafe'}
 let raw:OSMElement[]
 if(kind==='family') {
  const result=await request<{features:PhotonFeature[]}>(`https://photon.komoot.io/api/?q=nursing%20room&lat=${origin.lat}&lon=${origin.lon}&limit=15`)
  raw=result.features.map(elementOf).filter((p):p is OSMElement=>!!p)
 }else raw=await nearby(origin,tags[kind],10000,30)
 const data=await withDetails(raw)
 const {distanceMeters}=await import('./places')
 return data.flatMap(e=>{const point=e.lat!==undefined&&e.lon!==undefined?{lat:e.lat,lon:e.lon}:e.center;if(!point||!validPoint(point)||['no','private'].includes(e.tags?.access??''))return [];const distance=distanceMeters(origin,point);return distance<=10000?[{id:`${e.type}/${e.id}`,name:e.tags?.name||({toilets:'Restroom',fuel:'Fuel',water:'Drinking water',pharmacy:'Pharmacy',family:'Possible nursing room',work:'Café'}[kind]),...point,distance,tags:e.tags??{}}]:[]}).sort((a,b)=>a.distance-b.distance).slice(0,8)
}
