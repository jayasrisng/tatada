import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { go } from '../state/ui'
import { allCountries, countryCode } from '../travel/countries'
import { normalizeName, photoDay, placeTree, plannedCountries, travelStats, visitedCountries } from '../travel/history'
import { distanceMeters, validPoint } from '../discovery/places'
import { WorldMap } from './WorldMap'
import { PhotoImport } from './PhotoImport'
import { Btn } from './ui'

/** My map & timeline: the same chalk map as Home, a concise place list, and hand-editable countries. */
export function TravelHistory() {
  const { state, dispatch } = useStore()
  const photos = state.photoHistory ?? []
  const marks = state.countryMarks ?? {}
  const visited = visitedCountries(photos, marks), planned = plannedCountries(state.trips)
  const fromPhotos = new Set(photos.map((p) => countryCode(p.country)).filter((c): c is string => !!c))
  const stats = travelStats(photos.filter((p) => { const code = countryCode(p.country); return !!code && visited.has(code) }))
  const tree = placeTree(photos, visited)
  const [importing, setImporting] = useState(false), [editing, setEditing] = useState(false), [filter, setFilter] = useState('')
  const stops = useMemo(() => {
    const out: { lat: number; lon: number }[] = []
    for (const p of photos) if (p.lat !== undefined && p.lon !== undefined && validPoint({ lat: p.lat, lon: p.lon }) && !out.some((s) => distanceMeters(s, { lat: p.lat!, lon: p.lon! }) < 100)) out.push({ lat: p.lat, lon: p.lon })
    return out
  }, [photos])
  const countries = useMemo(() => allCountries(), [])
  const shown = countries.filter((c) => !filter.trim() || normalizeName(c.name).includes(normalizeName(filter)))
  const toggle = (code: string, on: boolean) => dispatch({ type: 'markCountry', code, mark: on === fromPhotos.has(code) ? null : on ? 'visited' : 'not_visited' })

  return <section className="travel-history" aria-label="My map and timeline">
    <WorldMap visited={visited} planned={planned} points={stops} label="Places you've been" />
    <p className="home-legend small dim"><i className="lg visited" /> been <i className="lg planned" /> planned{stops.length > 0 && <> <i className="lg point" /> photo spots</>}</p>
    <p className="travel-stats-line" aria-label="Travel counts">{visited.size} {visited.size === 1 ? 'country' : 'countries'} · {stats.cities} {stats.cities === 1 ? 'city' : 'cities'} · {stats.places} {stats.places === 1 ? 'place' : 'places'}</p>

    <div className="ac-buttons">
      <Btn kind="solid" icon="camera" onClick={() => setImporting(true)} disabled={importing}>add photos</Btn>
      <Btn kind="ghost" onClick={() => setEditing(!editing)} aria-expanded={editing}>{editing ? 'done editing' : 'edit countries'}</Btn>
    </div>
    {importing && <PhotoImport onClose={() => setImporting(false)} />}

    {editing && <div className="country-editor">
      <input className="chalk-input" placeholder="find a country" aria-label="Find a country" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <ul className="country-checks">{shown.map((c) => (
        <li key={c.code}><label><input type="checkbox" checked={visited.has(c.code)} onChange={(e) => toggle(c.code, e.target.checked)} /> {c.name}{fromPhotos.has(c.code) && <span className="small dim"> · from photos</span>}{planned.has(c.code) && !visited.has(c.code) && <span className="small dim"> · planned</span>}</label></li>
      ))}</ul>
    </div>}

    {tree.length ? <ul className="place-tree">{tree.map((c) => (
      <li key={c.code ?? c.name}><strong>{c.name}</strong>{c.cities.length > 0 && <span className="dim"> · {c.cities.map((city) => city.places.length ? `${city.name} (${city.places.join(', ')})` : city.name).join(', ')}</span>}</li>
    ))}</ul> : !importing && <p className="empty">Add a few photos or tick the countries you've been to. Nothing is inferred from sample trips.</p>}
    {planned.size > 0 && <p className="small dim">Planned: {state.trips.filter((t) => t.status !== 'past').map((t) => t.destination).join(', ')}</p>}

    {photos.length > 0 && <details className="photo-manage">
      <summary>places & imports ({photos.length})</summary>
      <ul>{[...photos].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)).map((p) => (
        <li key={p.id}><span>{[p.place, p.city, p.country].filter(Boolean).join(', ') || 'no location'} · {p.capturedAt ? photoDay(p) : 'no date'}</span>
          {p.tripId && <button className="link-btn" onClick={() => go(`/trip/${p.tripId}/journal`)}>trip</button>}
          <button className="link-btn danger" aria-label={`Remove ${p.filename}`} onClick={() => dispatch({ type: 'deleteTravelPhoto', id: p.id })}>remove</button></li>
      ))}</ul>
    </details>}
  </section>
}
