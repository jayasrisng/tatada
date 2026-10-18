import type { AppState, TravelPhoto, Trip } from '../types'
import { distanceMeters, validPoint } from '../discovery/places'
import { countryCode, countryName } from './countries'
export const normalizeName = (s: string) => s.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
const countryKey = (label: string) => countryCode(label) ?? `?${normalizeName(label)}`

/**
 * Counts from confirmed photo labels. Places are only the named places a person
 * confirmed (never coordinates or photo counts); stops cluster GPS within 100 m.
 */
export function travelStats(photos: TravelPhoto[]) {
  const countries = new Set(photos.filter((p) => p.country.trim()).map((p) => countryKey(p.country)))
  const cities = new Set(photos.filter((p) => p.city.trim()).map((p) => `${countryKey(p.country)}:${normalizeName(p.city)}`))
  const places = new Set(photos.filter((p) => p.place?.trim()).map((p) => `${countryKey(p.country)}:${normalizeName(p.city)}:${normalizeName(p.place!)}`))
  const stops: { lat: number; lon: number }[] = []
  for (const p of photos) if (p.lat !== undefined && p.lon !== undefined && validPoint({ lat: p.lat, lon: p.lon }) && !stops.some((s) => distanceMeters(s, { lat: p.lat!, lon: p.lon! }) < 100)) stops.push({ lat: p.lat, lon: p.lon })
  return { countries: countries.size, cities: cities.size, places: places.size, stops: stops.length, photos: photos.length }
}

/** ISO codes visited: confirmed photo countries plus hand-ticked ones, minus hand-unticked ones. */
export function visitedCountries(photos: TravelPhoto[], marks: AppState['countryMarks'] = {}) {
  const set = new Set(photos.map((p) => countryCode(p.country)).filter((c): c is string => !!c))
  for (const [code, mark] of Object.entries(marks)) mark === 'visited' ? set.add(code) : set.delete(code)
  return set
}

/** ISO codes of trips not yet taken. Kept separate from visited. */
export function plannedCountries(trips: Trip[]) {
  return new Set(trips.filter((t) => t.status !== 'past').map((t) => countryCode(t.country)).filter((c): c is string => !!c))
}

export interface CountryEntry { code?: string; name: string; cities: { name: string; places: string[] }[] }
/** Country → city → named places, from confirmed labels only. */
export function placeTree(photos: TravelPhoto[], visited: Set<string>): CountryEntry[] {
  const out = new Map<string, CountryEntry>()
  const entry = (key: string, code: string | undefined, name: string) => out.get(key) ?? out.set(key, { code, name, cities: [] }).get(key)!
  for (const p of photos) {
    if (!p.country.trim()) continue
    const code = countryCode(p.country), c = entry(code ?? `?${normalizeName(p.country)}`, code, code ? countryName(code) : p.country.trim())
    if (!p.city.trim()) continue
    let city = c.cities.find((x) => normalizeName(x.name) === normalizeName(p.city))
    if (!city) c.cities.push(city = { name: p.city.trim(), places: [] })
    if (p.place?.trim() && !city.places.some((x) => normalizeName(x) === normalizeName(p.place!))) city.places.push(p.place.trim())
  }
  for (const code of visited) if (!out.has(code)) out.set(code, { code, name: countryName(code), cities: [] })
  // Countries unticked by hand stay out of the list even if a photo names them.
  return [...out.values()].filter((c) => !c.code || visited.has(c.code)).sort((a, b) => a.name.localeCompare(b.name))
}

export const photoDay = (p: Pick<TravelPhoto, 'capturedAt'>) => p.capturedAt.slice(0, 10)
export function photoGroups(photos: TravelPhoto[]) {
  const sorted = [...photos].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
  const groups: TravelPhoto[][] = []
  for (const p of sorted) {
    const last = groups.at(-1)
    if (last && normalizeName(last[0].city) === normalizeName(p.city) && normalizeName(last[0].country) === normalizeName(p.country) && Date.parse(photoDay(p)) - Date.parse(photoDay(last.at(-1)!)) <= 3 * 86400000) last.push(p)
    else groups.push([p])
  }
  return groups
}

/** The trip happening now, else the nearest upcoming one. Dates are local calendar days. */
export function tripOfTheMoment(trips: Trip[], today: string) {
  const current = trips.filter((t) => t.start <= today && t.end >= today).sort((a, b) => a.start.localeCompare(b.start))[0]
  if (current) return { trip: current, now: true as const }
  const next = trips.filter((t) => t.start > today && t.status !== 'past').sort((a, b) => a.start.localeCompare(b.start))[0]
  return next ? { trip: next, now: false as const } : undefined
}
