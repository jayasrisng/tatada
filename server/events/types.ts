/*
 * Normalized public event listings. Unknown values stay undefined: no price,
 * time, distance or availability is ever filled in by Tatada.
 */
export type SourceId = 'luma' | 'eventbrite' | 'partiful'

export type Price = { kind: 'free' } | { kind: 'paid'; label: string } | { kind: 'unknown' }

export interface RawEvent {
  source: SourceId
  sourceId: string
  title: string
  url: string
  /** UTC instant (ISO). */
  start: string
  end?: string
  /** IANA zone the organizer listed. */
  timezone: string
  venue?: string
  city?: string
  lat?: number
  lon?: number
  /** True when the provider only gives an obfuscated/rounded location. */
  approximateLocation?: boolean
  price: Price
  canceled?: boolean
  soldOut?: boolean
  online?: boolean
  /** Category/tag words supplied by the provider. */
  tags: string[]
  description?: string
  organizer?: string
}

export interface EventResult {
  id: string
  title: string
  start: string
  end?: string
  timezone: string
  venue?: string
  city?: string
  distanceKm?: number
  approximateDistance?: boolean
  price: Price
  sources: { source: SourceId; label: string; url: string }[]
  reasons: string[]
  /** Short label of the provider-supplied tags shown in details. */
  tags: string[]
}

export type SourceState = 'ok' | 'empty' | 'failed' | 'not_covered'

export interface SourceStatus {
  source: SourceId
  label: string
  state: SourceState
  count: number
  /** One short sentence; only set when something is limited. */
  note?: string
  /** True when a cached copy was used because a fresh request failed. */
  stale?: boolean
  /** When the listings shown were fetched from the source (ISO). */
  checkedAt?: string
}

export type When = 'any' | 'today' | 'tomorrow' | 'weekend' | 'week'

export interface EventQuery {
  lat: number
  lon: number
  city?: string
  region?: string
  country?: string
  countryCode?: string
  q: string
  when: When
  freeOnly: boolean
}

export interface EventSearchResponse {
  events: EventResult[]
  sources: SourceStatus[]
  interests: string[]
  /** True when no listing matched the interests, so all events in the date window are shown. */
  relaxed: boolean
  location?: string
}

export const SOURCE_LABEL: Record<SourceId, string> = { luma: 'Luma', eventbrite: 'Eventbrite', partiful: 'Partiful' }
