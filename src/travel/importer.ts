/*
 * One photo import for the map and the closet. Pure helpers; the UI lives in
 * components/PhotoImport.tsx.
 *
 * Location rules:
 *  - Embedded labels (IPTC/XMP City, Country, Sub-location) prefill fields.
 *  - Coordinates without labels may be reverse-geocoded, with consent, to
 *    *propose* a city and country only. A named place is never derived from
 *    coordinates (the nearest mapped business is not where the photo was taken).
 *  - Anything unresolved stays blank. Dates come from EXIF or the traveler.
 */
import type { Garment, GarmentCategory, TravelPhoto, Trip } from '../types'
import { countryCode, countryName } from './countries'
import { normalizeName, photoDay, photoGroups } from './history'

export type FieldSource = 'metadata' | 'geocoded' | 'you'
export interface LocationFields { place: string; city: string; country: string }
export interface DraftPiece { name: string; category: GarmentCategory; color: string; image: string; own: boolean }

export interface ImportDraft {
  id: string
  fileName: string
  fingerprint: string
  image: string
  capturedAt: string
  dateSource: 'exif' | 'you'
  lat?: number
  lon?: number
  fields: LocationFields
  sources: Partial<Record<keyof LocationFields, FieldSource>>
  /** Already in the map history (location part is skipped). */
  inHistory: boolean
  /** Pieces from this photo are already in the closet. */
  inCloset: boolean
  geocode: 'none' | 'pending' | 'looking' | 'proposed' | 'nothing' | 'failed' | 'skipped'
  geocodeError?: string
  clothes: 'off' | 'queued' | 'detecting' | 'done' | 'none' | 'failed' | 'duplicate'
  clothesError?: string
  pieces: DraftPiece[]
}

const text = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : ''

/** Location labels embedded in photo metadata (IPTC / XMP photoshop / Iptc4xmpCore). */
export function metadataLabels(meta: Record<string, unknown> | null | undefined): Partial<LocationFields> {
  if (!meta) return {}
  const get = (...keys: string[]) => { for (const k of keys) { const v = text(meta[k]); if (v) return v } return '' }
  const code = get('CountryCode')
  const country = get('Country', 'CountryName', 'CountryPrimaryLocationName') || (code && countryCode(code) ? countryName(countryCode(code)!) : '')
  return Object.fromEntries(Object.entries({ place: get('Sublocation', 'Location', 'LocationName'), city: get('City'), country }).filter(([, v]) => v)) as Partial<LocationFields>
}

/** City/country proposal from a Photon reverse-geocoding feature. Never a place name. */
export function geocodeProposal(props: Record<string, unknown> | undefined): Partial<LocationFields> {
  if (!props) return {}
  const type = text(props.type), value = text(props.osm_value)
  const city = text(props.city) || (['city', 'town', 'village'].includes(type) || ['city', 'town', 'village'].includes(value) ? text(props.name) : '')
  const code = text(props.countrycode)
  const country = text(props.country) || (code && countryCode(code) ? countryName(countryCode(code)!) : '')
  return Object.fromEntries(Object.entries({ city, country }).filter(([, v]) => v)) as Partial<LocationFields>
}

/** Fills only empty fields, remembering where each value came from. Typed values always win. */
export function applyLabels(d: ImportDraft, labels: Partial<LocationFields>, source: FieldSource): ImportDraft {
  const fields = { ...d.fields }, sources = { ...d.sources }
  for (const key of ['place', 'city', 'country'] as const) {
    const v = labels[key]
    if (v && !fields[key].trim()) { fields[key] = v; sources[key] = source }
  }
  return { ...d, fields, sources }
}

export const setField = (d: ImportDraft, key: keyof LocationFields, value: string): ImportDraft =>
  ({ ...d, fields: { ...d.fields, [key]: value }, sources: { ...d.sources, [key]: value.trim() ? 'you' : undefined } })

/** Coordinates rounded to ~100 m before they leave the device. */
export const roundedPoint = (lat: number, lon: number) => ({ lat: Math.round(lat * 1000) / 1000, lon: Math.round(lon * 1000) / 1000 })

export const needsGeocode = (d: ImportDraft) => d.lat !== undefined && d.lon !== undefined && !d.inHistory && (!d.fields.city.trim() || !d.fields.country.trim())

export type DateProblem = 'future' | undefined
export function dateProblem(d: ImportDraft, today: string): DateProblem {
  return d.capturedAt && photoDay(d) > today ? 'future' : undefined
}

/** A photo joins the map only with at least a country; city and place are optional. */
export const mapsable = (d: ImportDraft) => !d.inHistory && !!d.fields.country.trim()

export function toTravelPhoto(d: ImportDraft): TravelPhoto {
  const sources = Object.values(d.sources)
  return {
    id: d.id, fingerprint: d.fingerprint, filename: d.fileName, capturedAt: d.capturedAt, dateSource: d.dateSource,
    city: d.fields.city.trim(), country: d.fields.country.trim(), ...(d.fields.place.trim() ? { place: d.fields.place.trim() } : {}),
    labelSource: sources.includes('you') ? 'you' : sources.includes('geocoded') ? 'geocoded' : sources.length ? 'metadata' : 'you',
    image: d.image, ...(d.lat !== undefined && d.lon !== undefined ? { lat: d.lat, lon: d.lon } : {}),
  }
}

/**
 * Trips for dated photos with a city, one per city and date cluster, reusing an
 * existing trip that already covers the dates. Undated photos only update
 * countries/cities. Mixed-location batches produce one trip per location.
 */
export function tripsFor(photos: TravelPhoto[], existing: Trip[], today: string, newId: () => string) {
  const trips: Trip[] = []
  const linked = photos.map((p) => ({ ...p }))
  const dated = linked.filter((p) => p.capturedAt && p.city.trim())
  for (const group of photoGroups(dated)) {
    const start = photoDay(group[0]), end = photoDay(group.at(-1)!), { city, country } = group[0]
    const match = [...existing, ...trips].find((t) => normalizeName(t.destination) === normalizeName(city) && normalizeName(t.country) === normalizeName(country) && t.start <= start && t.end >= end)
    const tripId = match?.id ?? newId()
    if (!match) trips.push({ id: tripId, destination: city.trim(), country: country.trim(), start, end, travelers: 1, companions: 'from my photos', budget: 0, vibe: [], constraints: [], discounts: [], status: end < today ? 'past' : 'upcoming', tint: 'blue', summary: {}, options: [], bookings: [], memories: [] })
    for (const p of group) p.tripId = tripId
  }
  return { photos: linked, trips }
}

export function toGarments(d: ImportDraft, newId: () => string, now: number): Garment[] {
  return d.pieces.filter((p) => p.own && p.name.trim()).map((p) => ({
    id: newId(), name: p.name.trim().slice(0, 60), category: p.category, color: p.color, vibe: ['casual'], image: p.image,
    isolated: true, source: 'camera', sourceFingerprint: d.fingerprint, addedAt: now,
  }))
}

/** What the import added, for the confirmation view. */
export function summarize(photos: TravelPhoto[], garments: Garment[]) {
  const cities = new Map<string, { city: string; country: string; places: Set<string> }>()
  for (const p of photos) {
    const key = `${normalizeName(p.country)}:${normalizeName(p.city)}`
    const entry = cities.get(key) ?? cities.set(key, { city: p.city, country: p.country, places: new Set() }).get(key)!
    if (p.place) entry.places.add(p.place)
  }
  return { locations: [...cities.values()].map((c) => ({ ...c, places: [...c.places] })), garments: garments.map((g) => ({ name: g.name, category: g.category })) }
}
