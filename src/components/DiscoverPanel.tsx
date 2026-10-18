import { useRef, useState } from 'react'
import type { Trip } from '../types'
import { useStore } from '../state/store'
import { uid } from '../state/id'
import { findCity, searchNearby } from '../discovery/search'
import { discoveryIntent, eventLinks, safeWebsite, type NearbyPlace, type PlacePreferences, type Point } from '../discovery/places'
import { Btn, Chip } from './ui'

export function DiscoverPanel({ trip }: { trip?: Trip }) {
  const { state, dispatch } = useStore()
  const [query, setQuery] = useState('coffee near me')
  const [city, setCity] = useState('')
  const [location, setLocation] = useState<{ name: string; point: Point } | null>(null)
  const [choices, setChoices] = useState<Awaited<ReturnType<typeof findCity>>>([])
  const [kind, setKind] = useState<'coffee' | 'restaurants' | 'events'>('coffee')
  const [prefs, setPrefs] = useState<PlacePreferences>({ close: true, parking: false, views: false, vegetarian: state.profile.diet.includes('vegetarian') })
  const [places, setPlaces] = useState<NearbyPlace[]>([])
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [searched, setSearched] = useState(false)
  const version = useRef(0)
  const invalidate = () => { version.current++; setBusy(false); setPlaces([]); setSearched(false); setError('') }
  const changeKind = (k: typeof kind) => { invalidate(); setKind(k); setQuery(k === 'coffee' ? 'coffee near me' : k === 'restaurants' ? 'restaurants near me' : 'events this week') }
  const locate = () => {
    if (!navigator.geolocation) return setError('Location is unavailable. Enter a city instead.')
    invalidate(); const id = version.current; setBusy(true)
    navigator.geolocation.getCurrentPosition((p) => { if (id !== version.current) return; setLocation({ name: 'Your current location', point: { lat: p.coords.latitude, lon: p.coords.longitude } }); setCity(''); setChoices([]); setBusy(false) }, () => { if (id !== version.current) return; setError('Location was not available. Enter a city or neighborhood instead.'); setBusy(false) }, { timeout: 15000, maximumAge: 60000 })
  }
  const search = async () => {
    if (!location) return setError('Use your location or choose a city first.')
    const id = ++version.current
    setBusy(true); setError(''); setPlaces([]); setSearched(false)
    try { const result = await searchNearby(location.point, kind === 'restaurants' ? 'restaurants' : 'coffee', prefs); if (id === version.current) { setPlaces(result); setSearched(true) } }
    catch (e) { if (id === version.current) setError((e as Error).message) }
    finally { if (id === version.current) setBusy(false) }
  }
  const links = eventLinks(city || location?.name || trip?.destination || '', query)
  return <section className="discover-panel" aria-label="Discover nearby">
    <h3 className="section-h">what sounds good?</h3>
    <div className="chips wrap">{(['coffee', 'restaurants', 'events'] as const).map((k) => <Chip key={k} on={kind === k} onClick={() => changeKind(k)}>{k}</Chip>)}</div>
    <label><span className="small dim">tell me what you're in the mood for</span><input className="chalk-input" value={query} onChange={(e) => { invalidate(); setQuery(e.target.value); const intent = discoveryIntent(e.target.value, prefs); setKind(intent.kind); setPrefs(intent.prefs) }} aria-label="What sounds good?" /></label>
    <div className="discover-location">
      <Btn kind="ghost" icon="pin" disabled={busy} onClick={locate}>use my location</Btn>
      <form onSubmit={async (e) => { e.preventDefault(); invalidate(); const id = version.current; setBusy(true); setLocation(null); try { const result = await findCity(city); if (id !== version.current) return; setChoices(result); if (!result.length) setError('No matching city found. Try the city and country.'); } catch (e) { if (id === version.current) setError((e as Error).message) } finally { if (id === version.current) setBusy(false) } }}>
        <input className="chalk-input" aria-label="City or neighborhood" placeholder="or a city / neighborhood" value={city} onChange={(e) => { invalidate(); setLocation(null); setChoices([]); setCity(e.target.value) }} />
        <Btn kind="ghost" type="submit" disabled={busy || !city.trim()}>find city</Btn>
      </form>
      {choices.map((c) => <button className="suggest" key={`${c.point.lat},${c.point.lon}`} onClick={() => { invalidate(); setLocation(c); setChoices([]) }}>{c.name}</button>)}
      {location && <p role="status" className="small">searching around {location.name}</p>}
    </div>
    {kind !== 'events' ? <>
      <div className="chips wrap">{([['close', 'within 1 km'], ['parking', 'parking nearby'], ['views', 'viewpoints nearby'], ['vegetarian', 'vegetarian']] as const).map(([key, label]) => <Chip key={key} on={prefs[key]} onClick={() => { invalidate(); setPrefs({ ...prefs, [key]: !prefs[key] }) }}>{label}</Chip>)}</div>
      <Btn kind="solid" disabled={busy || !location} onClick={() => void search()}>{busy ? 'looking…' : 'find places for me'}</Btn>
      <p className="dim small">Live OpenStreetMap listings, ranked by distance and matching mapped preferences. Your words select coffee, restaurants or events and simple preferences; use the chips to refine. Ratings, opening hours and availability are not verified. Distances are straight-line, not walking routes.</p>
      {searched && !places.length && <p role="status">No matching mapped places in this radius. Try turning off “within 1 km” or check Maps.</p>}
      <div className="nearby-results">{places.map((p, i) => <article key={p.id} className="nearby-card"><h3>{i === 0 ? '✶ ' : ''}{p.name}</h3><p className="small">{Math.round(p.distance)} m away · {p.tags.cuisine?.replace(/;/g, ', ') || (kind === 'coffee' ? 'café' : 'restaurant')}</p><ul className="small">{['yes', 'only'].includes(p.tags['diet:vegetarian']) && <li>vegetarian options mapped</li>}{p.parkingDistance !== undefined && p.parkingDistance < 200 && <li>mapped parking {Math.round(p.parkingDistance)} m away; spaces/fees unknown</li>}{p.viewDistance !== undefined && p.viewDistance < 200 && <li>viewpoint {Math.round(p.viewDistance)} m away; view from the venue unknown</li>}</ul><div className="ac-buttons"><a href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`} target="_blank" rel="noreferrer">reviews & directions ↗</a><a href={`https://www.openstreetmap.org/${p.id}`} target="_blank" rel="noreferrer">source ↗</a>{safeWebsite(p.tags.website) && <a href={safeWebsite(p.tags.website)} target="_blank" rel="noreferrer">website ↗</a>}</div><Btn kind="ghost" disabled={state.items.some((item) => item.note === `https://www.openstreetmap.org/${p.id}` && item.tripId === trip?.id)} onClick={() => dispatch({ type: 'addItem', item: { id: uid(), tripId: trip?.id, phase: 'discover', text: `Check out ${p.name}`, note: `https://www.openstreetmap.org/${p.id}`, kind: 'idea', done: false } })}>save to {trip?.destination ?? 'my tasks'}</Btn></article>)}</div>
    </> : <><p>Explore public events in {city || location?.name || 'your city'}. These open provider searches; Tatada does not yet import or rank their listings.</p><div className="chips wrap">{links.map((l) => <a className="btn btn-ghost" key={l.label} href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>)}</div></>}
    {error && <p className="ac-problem" role="alert">{error}</p>}
    <p className="small dim">Location searches go to Photon / OpenStreetMap. Nothing books or sends a message. <a href={`https://www.google.com/maps/search/${encodeURIComponent(`${query} ${city || location?.name || ''}`)}`} target="_blank" rel="noreferrer">search Maps ↗</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></p>
  </section>
}
