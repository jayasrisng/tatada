import { lazy, Suspense, useRef, useState } from 'react'
import type { TravelPhoto, Trip } from '../types'
import { uid, useStore } from '../state/store'
import { go } from '../state/ui'
import { normalizeName, photoDay, photoGroups, travelStats } from '../travel/history'
import { readTravelPhoto } from '../travel/photos'
import { Btn } from './ui'
const TravelMap = lazy(() => import('./TravelMap'))

export function TravelHistory() {
  const { state, dispatch } = useStore()
  const photos = state.photoHistory ?? []
  const stats = travelStats(photos)
  const [showMap, setShowMap] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const [drafts, setDrafts] = useState<(TravelPhoto & { selected: boolean })[]>([])
  const [city, setCity] = useState(''), [country, setCountry] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    if (files.length > 20) return setMessage('Choose up to 20 photos at a time, from one city. Originals stay outside Tatada.')
    setBusy(true); setMessage(''); setDrafts([])
    const out = [], errors = []
    const seen = new Set(photos.map((p) => p.fingerprint))
    for (const f of Array.from(files)) {
      try { const p = await readTravelPhoto(f); if (!seen.has(p.fingerprint)) { out.push({ ...p, selected: true }); seen.add(p.fingerprint) } }
      catch (e) { errors.push((e as Error).message) }
    }
    setDrafts(out); setBusy(false)
    setMessage(errors.join(' ') || (!out.length ? 'These photos are already in your timeline.' : 'Review dates and label the city/country before importing. Missing GPS stays unmapped.'))
  }
  const save = () => {
    const selected = drafts.filter((p) => p.selected).map(({ selected: _s, ...p }) => ({ ...p, city: city.trim(), country: country.trim() }))
    if (!city.trim() || !country.trim() || !selected.length) return setMessage('Choose photos and enter their city and country.')
    const today = new Date().toLocaleDateString('en-CA')
    if (selected.some((p) => !/^\d{4}-\d{2}-\d{2}T/.test(p.capturedAt) || photoDay(p) > today)) return setMessage('Check the dates. Travel history needs a known date in the past or today.')
    const trips: Trip[] = []
    for (const group of photoGroups(selected)) {
      const start = photoDay(group[0]), end = photoDay(group.at(-1)!)
      const existing = state.trips.find((t) => normalizeName(t.destination) === normalizeName(city) && normalizeName(t.country) === normalizeName(country) && t.start <= start && t.end >= end)
      const tripId = existing?.id ?? uid()
      if (!existing) trips.push({ id: tripId, destination: city.trim(), country: country.trim(), start, end, travelers: 1, companions: 'from my photos', budget: 0, vibe: [], constraints: [], discounts: [], status: end < today ? 'past' : 'upcoming', tint: 'blue', summary: {}, options: [], bookings: [], memories: [] })
      group.forEach((p) => { p.tripId = tripId })
    }
    if (JSON.stringify(state).length + JSON.stringify(selected).length > 1_500_000) return setMessage('Browser photo storage is full. Export a backup and remove some photos first.')
    dispatch({ type: 'importTravelPhotos', photos: selected, trips }); setDrafts([]); setMessage(`Imported ${selected.length} photos into your travel timeline.`)
  }
  return <section className="travel-history" aria-label="My travel history">
    <h2 className="chalk-title">where life has taken you</h2>
    <div className="travel-stats"><div><strong>{stats.countries}</strong> countries</div><div><strong>{stats.cities}</strong> cities</div><div><strong>{stats.stops}</strong> photo stops</div></div>
    <p className="dim small">Counts use your imported photos and the city/country labels you confirm. Stops group GPS points within 100 m; they aren't a count of businesses. Sample and planned trips aren't counted.</p>
    <div className="ac-buttons"><Btn kind="solid" icon="camera" disabled={busy} onClick={() => file.current?.click()}>{busy ? 'reading photos…' : 'import travel photos'}</Btn><Btn kind="ghost" icon="pin" onClick={() => setShowMap(!showMap)}>{showMap ? 'hide map' : 'open my map'}</Btn></div>
    <input type="file" multiple accept="image/*" hidden ref={file} aria-label="Travel photos" onChange={(e) => { void upload(e.target.files); e.target.value = '' }} />
    <p className="dim small">Select files exported/downloaded from Google Photos, or your camera roll. Dates and GPS are read on this device. No Google account connection or whole-library scan is active. Labels and GPS save in this browser and your exported backup.</p>
    {showMap && <><Suspense fallback={<p>Loading map…</p>}><TravelMap photos={photos} /></Suspense><p className="dim small">Map tiles load from OpenStreetMap. Only photos with GPS can be placed. Your photo list and images are not sent to the map provider.</p></>}
    {drafts.length > 0 && <form className="details-form" onSubmit={(e) => { e.preventDefault(); save() }}>
      <h3 className="section-h">review this city's photos</h3>
      <label>city<input className="chalk-input" aria-label="Photo city" value={city} onChange={(e) => setCity(e.target.value)} required /></label>
      <label>country<input className="chalk-input" aria-label="Photo country" value={country} onChange={(e) => setCountry(e.target.value)} required /></label>
      {drafts.map((p, i) => <div className="travel-photo-review" key={p.id}>
        <input type="checkbox" aria-label={`Import ${p.filename}`} checked={p.selected} onChange={(e) => setDrafts((all) => all.map((v, n) => n === i ? { ...v, selected: e.target.checked } : v))} />
        <img src={p.image} alt={p.filename} />
        <label>{p.filename}<input className="chalk-input" aria-label={`Date for ${p.filename}`} type="date" value={photoDay(p)} onChange={(e) => setDrafts((all) => all.map((v, n) => n === i ? { ...v, capturedAt: `${e.target.value}T12:00:00`, dateSource: 'you' } : v))} /><span className="small dim">{p.dateSource === 'exif' ? 'photo date' : 'date you choose'} · {p.lat === undefined ? 'no GPS' : 'GPS available'}</span></label>
      </div>)}
      <div className="ac-buttons"><Btn kind="solid" type="submit">add to my timeline</Btn><Btn kind="ghost" type="button" onClick={() => setDrafts([])}>discard</Btn></div>
    </form>}
    {message && <p role="status" className="small">{message}</p>}
    {!photos.length && <p className="empty">Your own travel story starts with a few photos. Nothing is inferred from sample trips.</p>}
    <ol className="photo-timeline">{[...photos].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)).map((p) => <li key={p.id}><img src={p.image} alt={p.filename} loading="lazy" /><div><strong>{p.city}, {p.country}</strong><p className="small">{photoDay(p)} · {p.lat === undefined ? 'location label confirmed by you; no GPS' : 'photo GPS'}</p><div className="ac-buttons">{p.tripId && <button className="linkbtn" onClick={() => go(`/trip/${p.tripId}/journal`)}>open trip</button>}<button className="linkbtn" onClick={() => go(`/style?photo=${p.id}`)}>find clothes</button><button className="linkbtn danger" onClick={() => dispatch({ type: 'deleteTravelPhoto', id: p.id })}>remove photo</button></div></div></li>)}</ol>
  </section>
}
