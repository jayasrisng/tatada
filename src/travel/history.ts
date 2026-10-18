import type { TravelPhoto } from '../types'
import { distanceMeters, validPoint } from '../discovery/places'
export const normalizeName = (s: string) => s.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
export function travelStats(photos: TravelPhoto[]) {
  const countries = new Set(photos.map((p) => normalizeName(p.country)).filter(Boolean))
  const cities = new Set(photos.filter((p) => p.city.trim()).map((p) => `${normalizeName(p.country)}:${normalizeName(p.city)}`))
  const stops: { lat: number; lon: number }[] = []
  for (const p of photos) if (p.lat !== undefined && p.lon !== undefined && validPoint({ lat: p.lat, lon: p.lon }) && !stops.some((s) => distanceMeters(s, { lat: p.lat!, lon: p.lon! }) < 100)) stops.push({ lat: p.lat, lon: p.lon })
  return { countries: countries.size, cities: cities.size, stops: stops.length, photos: photos.length }
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
