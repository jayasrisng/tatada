import { useRef, useState } from 'react'
import type { Trip } from '../types'
import { useStore } from '../state/store'
import { uid } from '../state/id'
import { describePoint, findCity, searchNearby, type Place } from '../discovery/search'
import { EventsUnavailable, searchEvents } from '../discovery/events'
import { checkedLine, eventPlaceLine, eventSaveText, formatEventTime, formatPrice, sourceSummary, type EventItem, type EventSearch } from '../discovery/eventFormat'
import { NO_PREFERENCES, discoveryIntent, eventLinks, formatDistance, safeWebsite, type DiscoverKind, type EventWhen, type NearbyPlace, type PlacePreferences } from '../discovery/places'
import { Btn, Chip } from './ui'

const KINDS: [DiscoverKind, string][] = [['coffee', 'coffee'], ['restaurants', 'food'], ['events', 'events']]
const WHEN: [EventWhen, string][] = [['any', 'any time'], ['today', 'today'], ['tomorrow', 'tomorrow'], ['weekend', 'this weekend'], ['week', 'next 7 days']]
const PREFS: [keyof Omit<PlacePreferences, 'cuisine'>, string][] = [['walk', 'walkable'], ['parking', 'parking'], ['views', 'a view'], ['vegetarian', 'vegetarian'], ['openNow', 'open now'], ['vegan', 'vegan'], ['outdoor', 'outdoor seating'], ['wifi', 'wi-fi']]
const ALWAYS_SHOWN = new Set(['walk', 'parking', 'views', 'vegetarian', 'openNow'])
const FIRST = 4

const locate = () => new Promise<Place>((resolve, reject) => {
  if (!navigator.geolocation) return reject(new Error('Location is unavailable here. Type a city instead.'))
  navigator.geolocation.getCurrentPosition(
    (p) => resolve({ name: 'your location', point: { lat: p.coords.latitude, lon: p.coords.longitude }, device: true }),
    () => reject(new Error('Location was not shared. Type a city or neighborhood instead.')),
    { timeout: 15000, maximumAge: 60000 },
  )
})

export function DiscoverPanel({ trip }: { trip?: Trip }) {
  const { state, dispatch } = useStore()
  const defaults: PlacePreferences = { ...NO_PREFERENCES, vegetarian: state.profile.diet.includes('vegetarian'), vegan: state.profile.diet.includes('vegan') }
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<DiscoverKind>('coffee')
  const [prefs, setPrefs] = useState<PlacePreferences>(defaults)
  const [when, setWhen] = useState<EventWhen>('any')
  const [freeOnly, setFreeOnly] = useState(false)
  const [asksRatings, setAsksRatings] = useState(false)
  const [cityText, setCityText] = useState('')
  const [location, setLocation] = useState<Place | null>(null)
  const [alternatives, setAlternatives] = useState<Place[]>([])
  const [places, setPlaces] = useState<NearbyPlace[] | null>(null)
  const [events, setEvents] = useState<EventSearch | null>(null)
  const [unavailable, setUnavailable] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const version = useRef(0)

  const clear = () => { version.current++; setBusy(false); setPlaces(null); setEvents(null); setUnavailable(''); setError(''); setShowAll(false) }
  const onQuery = (text: string) => {
    clear(); setQuery(text)
    const intent = discoveryIntent(text, defaults, kind)
    setKind(intent.kind); setPrefs(intent.prefs); setWhen(intent.when); setFreeOnly(intent.freeOnly); setAsksRatings(intent.asksRatings)
  }

  async function resolveLocation(id: number, useDevice = false): Promise<Place | undefined> {
    if (location) return location
    if (cityText.trim() && !useDevice) {
      const found = await findCity(cityText)
      if (id !== version.current) return
      if (!found.length) throw new Error('No matching place found. Try the city and country.')
      setLocation(found[0]); setAlternatives(found.slice(1))
      return found[0]
    }
    const here = await locate()
    if (id !== version.current) return
    setLocation(here)
    return here
  }

  async function find(next: { when?: EventWhen; freeOnly?: boolean; useDevice?: boolean } = {}) {
    const id = ++version.current
    setBusy(true); setError(''); setPlaces(null); setEvents(null); setUnavailable(''); setShowAll(false)
    try {
      let place = await resolveLocation(id, next.useDevice)
      if (!place || id !== version.current) return
      if (kind === 'events') {
        if (place.device && !place.city) { place = { ...place, ...(await describePoint(place.point)) }; if (id === version.current) setLocation(place) }
        const result = await searchEvents(place, query, next.when ?? when, next.freeOnly ?? freeOnly)
        if (id === version.current) setEvents(result)
      } else {
        const result = await searchNearby(place, kind, prefs, (routed) => { if (id === version.current) setPlaces(routed) })
        if (id === version.current) setPlaces(result)
      }
    } catch (e) {
      if (id !== version.current) return
      if (e instanceof EventsUnavailable) setUnavailable(e.message)
      else setError((e as Error).message)
    } finally { if (id === version.current) setBusy(false) }
  }

  const saved = (url: string) => state.items.some((item) => item.note === url && item.tripId === trip?.id)
  const save = (text: string, url: string) => dispatch({ type: 'addItem', item: { id: uid(), tripId: trip?.id, phase: 'discover', text, note: url, kind: 'idea', done: false } })
  const saveLabel = (url: string) => saved(url) ? 'saved ✓' : `save to ${trip?.destination ?? 'tasks'}`
  const where = location?.city ?? (location?.device ? '' : location?.name) ?? cityText

  const shownPlaces = places && (showAll ? places : places.slice(0, FIRST))
  const shownEvents = events && (showAll ? events.events : events.events.slice(0, FIRST + 1))
  const total = places?.length ?? events?.events.length ?? 0

  return <section className="discover-panel" aria-label="Discover nearby">
    <form className="discover-ask" onSubmit={(e) => { e.preventDefault(); void find() }}>
      <input className="chalk-input discover-query" value={query} onChange={(e) => onQuery(e.target.value)} aria-label="What are you looking for?"
        placeholder={kind === 'events' ? 'live music this weekend' : kind === 'restaurants' ? 'vegetarian dinner, walkable' : 'coffee with parking and a view'} enterKeyHint="search" />
    </form>
    <div className="discover-kinds" role="group" aria-label="Looking for">
      {KINDS.map(([k, label]) => <button type="button" key={k} className={kind === k ? 'on' : ''} aria-pressed={kind === k} onClick={() => { clear(); setKind(k) }}>{label}</button>)}
    </div>

    <div className="discover-where">
      {location ? <p>near <strong>{location.name}</strong> <button type="button" className="link-btn" onClick={() => { clear(); setLocation(null); setAlternatives([]) }}>change</button></p> : <>
        <Btn kind="ghost" icon="pin" type="button" disabled={busy} onClick={() => { setCityText(''); void find({ useDevice: true }) }}>near me</Btn>
        <input className="chalk-input" aria-label="City or neighborhood" placeholder="or a city / neighborhood" value={cityText} onChange={(e) => { clear(); setCityText(e.target.value) }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void find() } }} />
      </>}
      {location && alternatives.length > 0 && <p className="small dim">not this? {alternatives.map((c) => <button type="button" className="link-btn" key={`${c.point.lat},${c.point.lon}`} onClick={() => { clear(); setLocation(c); setAlternatives(alternatives.filter((a) => a !== c).concat(location)) }}>{c.name}</button>)}</p>}
    </div>

    {kind === 'events' ? <div className="discover-filters">
      <div className="chips wrap" role="group" aria-label="When">{WHEN.map(([w, label]) => <Chip key={w} on={when === w} onClick={() => { setWhen(w); if (events) void find({ when: w }) }}>{label}</Chip>)}</div>
      <div className="chips wrap"><Chip on={freeOnly} onClick={() => { setFreeOnly(!freeOnly); if (events) void find({ freeOnly: !freeOnly }) }}>free only</Chip></div>
    </div> : <div className="chips wrap discover-filters" role="group" aria-label="What matters">
      {PREFS.filter(([key]) => ALWAYS_SHOWN.has(key) || prefs[key]).map(([key, label]) => <Chip key={key} on={prefs[key]} onClick={() => { clear(); setPrefs({ ...prefs, [key]: !prefs[key] }) }}>{label}</Chip>)}
      {prefs.cuisine && <Chip on onClick={() => { clear(); setPrefs({ ...prefs, cuisine: undefined }) }}>{prefs.cuisine} ×</Chip>}
    </div>}

    <Btn kind="solid" className="discover-go" disabled={busy} onClick={() => void find()}>{busy ? 'looking…' : 'find'}</Btn>
    {error && <p className="ac-problem" role="alert">{error}</p>}

    {places && <div className="discover-results" aria-live="polite">
      {asksRatings && <p className="small dim">No ratings source is connected, so these are ranked on what is mapped.</p>}
      {!places.length && <p role="status">Nothing mapped matches all of that{prefs.walk ? ' within walking distance' : ''}. Try turning off a preference{prefs.walk ? ' or “walkable”' : ''}.</p>}
      <ol className="results">{shownPlaces!.map((p) => {
        const source = `https://www.openstreetmap.org/${p.id}`
        const meta = [p.walk ? `about ${p.walk.minutes} min walk` : `${formatDistance(p.distance)} away`, p.openLabel, p.tags.cuisine?.split(';')[0].replace(/_/g, ' ')].filter(Boolean).join(' · ')
        return <li key={p.id} className="result">
          <h3>{p.name}</h3>
          <p className="result-meta">{meta}</p>
          {p.reasons.length > 0 && <ul className="result-why">{p.reasons.slice(0, 3).map((r) => <li key={r}>{r}</li>)}</ul>}
          <div className="result-actions">
            <Btn kind="ghost" disabled={saved(source)} onClick={() => save(`Check out ${p.name}`, source)}>{saveLabel(source)}</Btn>
            <details><summary>details</summary>
              <ul className="small">{p.walk && <li>Walking time and {formatDistance(p.walk.meters)} route are OpenStreetMap routing estimates.</li>}{p.notes.map((n) => <li key={n}>{n}</li>)}<li>Ratings and reviews: not available here.</li></ul>
              <p className="small links"><a href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`} target="_blank" rel="noreferrer">map & reviews ↗</a> <a href={source} target="_blank" rel="noreferrer">OpenStreetMap ↗</a> {safeWebsite(p.tags.website) && <a href={safeWebsite(p.tags.website)} target="_blank" rel="noreferrer">website ↗</a>}</p>
            </details>
          </div>
        </li>
      })}</ol>
    </div>}

    {events && <div className="discover-results" aria-live="polite">
      <p className="small dim">{[sourceSummary(events.sources), checkedLine(events.sources)].filter(Boolean).join(' · ')}{events.sources.some((s) => s.note) && <details className="coverage"><summary>why?</summary><ul>{events.sources.filter((s) => s.note).map((s) => <li key={s.source}>{s.label}: {s.note}</li>)}</ul></details>}</p>
      {events.relaxed && <p className="small">Nothing mentioned “{events.interests.join(', ')}”; here is what else is on.</p>}
      {!events.events.length && <p role="status">No upcoming public listings found{when !== 'any' ? ' for that time' : ''}{freeOnly ? ' marked free' : ''}. Try another time or interest.</p>}
      <ol className="results">{shownEvents!.map((e: EventItem) => {
        const url = e.sources[0].url
        return <li key={e.id} className="result">
          <h3>{e.title}</h3>
          <p className="result-meta">{formatEventTime(e)}</p>
          <p className="result-meta">{[eventPlaceLine(e), formatPrice(e.price)].filter(Boolean).join(' · ')}</p>
          {e.reasons.length > 0 && <ul className="result-why">{e.reasons.slice(0, 2).map((r) => <li key={r}>{r}</li>)}</ul>}
          <div className="result-actions">
            <Btn kind="ghost" disabled={saved(url)} onClick={() => save(eventSaveText(e), url)}>{saveLabel(url)}</Btn>
            <details><summary>details</summary>
              <ul className="small">{e.reasons.slice(2).map((r) => <li key={r}>{r}</li>)}{e.tags.length > 0 && <li>Listed as {e.tags.join(', ')}</li>}{e.approximateDistance && <li>Distance is approximate; the source only shares a rough location.</li>}{e.price.kind === 'unknown' && <li>The listing page doesn't show a price here. Check the source.</li>}<li>Times are in the event's time zone.</li></ul>
              <p className="small links">{e.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer">on {s.label} ↗</a>)}</p>
            </details>
          </div>
        </li>
      })}</ol>
    </div>}

    {total > (places ? FIRST : FIRST + 1) && !showAll && <Btn kind="ghost" className="discover-more" onClick={() => setShowAll(true)}>show {total - (places ? FIRST : FIRST + 1)} more</Btn>}

    {unavailable && <div className="discover-results" role="status">
      <p>{unavailable} You can still search each provider:</p>
      <div className="chips wrap">{eventLinks(where || trip?.destination || '', query).map((l) => <a className="btn btn-ghost" key={l.label} href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>)}</div>
    </div>}

    <p className="small dim discover-foot">Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors (<a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">fix the map</a>) · walking routes by <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noreferrer">FOSSGIS</a> · events from public Luma, Eventbrite and Partiful pages. Nothing is booked or sent.</p>
  </section>
}
