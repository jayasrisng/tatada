import { useEffect, useRef, useState } from 'react'
import type { GarmentCategory } from '../../types'
import { useStore } from '../../state/store'
import { uid } from '../../state/id'
import { go } from '../../state/ui'
import { TODAY } from '../layout/ui'
import { Btn } from '../layout/ui'
import { readImportPhoto } from '../../travel/photos'
import { applyLabels, dateProblem, geocodeProposal, mapsable, needsGeocode, roundedPoint, setField, summarize, toGarments, toTravelPhoto, tripsFor, type ImportDraft, type LocationFields } from '../../travel/importer'
import { photoDay } from '../../travel/history'
import { processPhoto } from '../../style/camera'
import { extractClothes } from '../../style/extract'

const MAX_FILES = 20, MAX_CAMERA = 24, STORAGE_BUDGET = 1_500_000
const CATS: GarmentCategory[] = ['top', 'bottom', 'dress', 'layer', 'shoes']
const SOURCE_LABEL = { metadata: 'from photo', geocoded: 'suggested from GPS', you: '' } as const
const geocodeCache = new Map<string, Partial<LocationFields>>()
type Result = ReturnType<typeof summarize>

/**
 * One import for the map and the closet. New map entries keep metadata only; the review image is discarded after confirmation. Each selected photo is read on this
 * device; its location fields and detected clothes are reviewed separately,
 * and neither part blocks the other.
 */
export function PhotoImport({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [drafts, setDrafts] = useState<ImportDraft[]>([])
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [clothesOn, setClothesOn] = useState(true)
  const [consent, setConsent] = useState<'ask' | 'yes' | 'no'>('ask')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulk, setBulk] = useState<LocationFields>({ place: '', city: '', country: '' })
  const [modelStatus, setModelStatus] = useState('')
  const [problem, setProblem] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const files = useRef(new Map<string, File>())
  const input = useRef<HTMLInputElement>(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const patch = (id: string, fn: (d: ImportDraft) => ImportDraft): void => { if (alive.current) setDrafts((all) => all.map((d) => d.id === id ? fn(d) : d)) }

  async function choose(list: FileList | null) {
    if (!list?.length) return
    setProblem(''); setResult(null)
    const chosen = Array.from(list)
    if (chosen.length > MAX_FILES) return setProblem(`Choose up to ${MAX_FILES} photos at a time.`)
    const known = new Set((state.photoHistory ?? []).map((p) => p.fingerprint))
    const inCloset = new Set((state.wardrobe ?? []).map((g) => g.sourceFingerprint).filter(Boolean))
    const seen = new Set(drafts.map((d) => d.fingerprint)), out: ImportDraft[] = [], errs: string[] = []
    setReading({ done: 0, total: chosen.length })
    for (const [i, f] of chosen.entries()) {
      try {
        const d = await readImportPhoto(f)
        if (seen.has(d.fingerprint)) { errs.push(`${f.name}: already in this batch.`); continue }
        seen.add(d.fingerprint)
        files.current.set(d.id, f)
        const dupCloset = inCloset.has(d.fingerprint)
        out.push({ ...d, inHistory: known.has(d.fingerprint), inCloset: dupCloset, geocode: needsGeocode({ ...d, inHistory: known.has(d.fingerprint) }) ? 'pending' : 'none', clothes: !clothesOn ? 'off' : dupCloset ? 'duplicate' : 'queued' })
      } catch (e) { errs.push((e as Error).message) }
      if (alive.current) setReading({ done: i + 1, total: chosen.length })
    }
    if (!alive.current) return
    setReading(null); setErrors(errs)
    setDrafts((all) => [...all, ...out])
  }

  // Reverse geocoding: only with consent, one request at a time, rounded coordinates, never the image.
  useEffect(() => {
    if (consent !== 'yes') return
    const next = drafts.find((d) => d.geocode === 'pending')
    if (!next || drafts.some((d) => d.geocode === 'looking')) return
    patch(next.id, (d) => ({ ...d, geocode: 'looking' }))
    const { lat, lon } = roundedPoint(next.lat!, next.lon!), key = `${lat},${lon}`
    const lookup = geocodeCache.has(key) ? Promise.resolve(geocodeCache.get(key)!) : new Promise((r) => setTimeout(r, 1100))
      .then(() => fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&limit=1&lang=en`, { signal: AbortSignal.timeout(10_000) }))
      .then((r) => { if (!r.ok) throw new Error('The place-name service is busy.'); return r.json() })
      .then((j: { features?: { properties?: Record<string, unknown> }[] }) => { const p = geocodeProposal(j.features?.[0]?.properties); geocodeCache.set(key, p); return p })
    lookup.then((labels) => patch(next.id, (d) => { const n = applyLabels(d, labels, 'geocoded'); return { ...n, geocode: labels.city || labels.country ? 'proposed' : 'nothing' } }),
      (e: Error) => patch(next.id, (d) => ({ ...d, geocode: 'failed', geocodeError: e.name === 'TimeoutError' ? 'The place-name service timed out.' : e.message || 'Lookup failed.' })))
  }, [drafts, consent])
  useEffect(() => { if (consent === 'no') setDrafts((all) => all.map((d) => d.geocode === 'pending' ? { ...d, geocode: 'skipped' } : d)) }, [consent, drafts.length])

  // Clothing detection: one photo at a time on this device; failures stay per photo.
  useEffect(() => {
    const next = drafts.find((d) => d.clothes === 'queued')
    if (!next || drafts.some((d) => d.clothes === 'detecting')) return
    const file = files.current.get(next.id)
    if (!file) { patch(next.id, (d) => ({ ...d, clothes: 'failed', clothesError: 'Photo is no longer available; choose it again.' })); return }
    patch(next.id, (d) => ({ ...d, clothes: 'detecting' }))
    void (async () => {
      try {
        const p = await processPhoto(file)
        const pieces = p.isolated ? [{ image: p.dataUrl, color: p.color, name: 'My garment', category: 'top' as const }] : await extractClothes(file, (s) => alive.current && setModelStatus(s))
        patch(next.id, (d) => ({ ...d, clothes: pieces.length ? 'done' : 'none', pieces: pieces.map((x) => ({ name: x.name, category: x.category, color: x.color, image: x.image, own: false })) }))
      } catch (e) {
        const raw = (e as Error).message
        const msg = /fetch|network|load/i.test(raw) ? "Couldn't download the clothing detector (offline or blocked). Locations are unaffected." : raw
        patch(next.id, (d) => ({ ...d, clothes: /No clothes were detected/.test(raw) ? 'none' : 'failed', clothesError: msg }))
      } finally { if (alive.current) setModelStatus('') }
    })()
  }, [drafts])

  const busyClothes = drafts.filter((d) => d.clothes === 'queued' || d.clothes === 'detecting').length
  const geocoding = drafts.some((d) => d.geocode === 'looking')
  const toMap = drafts.filter(mapsable)
  const pieces = drafts.reduce((n, d) => n + d.pieces.filter((p) => p.own).length, 0)
  const future = drafts.filter((d) => mapsable(d) && dateProblem(d, TODAY))

  function confirm() {
    setProblem('')
    if (future.length) return setProblem(`Fix the future date on ${future.map((d) => d.fileName).join(', ')}.`)
    const photos = toMap.map(toTravelPhoto)
    const { photos: linked, trips } = tripsFor(photos, state.trips, TODAY, uid)
    const garments = drafts.flatMap((d) => toGarments(d, uid, Date.now()))
    const camera = (state.wardrobe ?? []).filter((g) => g.source === 'camera').length
    if (camera + garments.length > MAX_CAMERA) return setProblem(`The closet keeps up to ${MAX_CAMERA} photo pieces on this device. Untick some pieces or remove old ones.`)
    if (JSON.stringify(state).length + JSON.stringify(linked).length + garments.reduce((n, g) => n + (g.image?.length ?? 0), 0) > STORAGE_BUDGET) return setProblem('Browser storage is full. Export a backup and remove some photos or pieces, then try again. Nothing was added.')
    if (linked.length) dispatch({ type: 'importTravelPhotos', photos: linked, trips })
    for (const g of garments) dispatch({ type: 'addGarment', garment: g })
    setResult(summarize(linked, garments)); setDrafts([]); files.current.clear(); setSelected(new Set())
  }

  if (result) return (
    <section className="photo-import" aria-label="Import result">
      <h3 className="section-h">added</h3>
      {result.locations.length ? <ul className="import-result">{result.locations.map((l) => <li key={`${l.city}:${l.country}`}><strong>{[l.city, l.country].filter(Boolean).join(', ')}</strong>{l.places.length > 0 && <span className="dim"> · {l.places.join(', ')}</span>}</li>)}</ul> : <p className="dim">No places added.</p>}
      {result.garments.length ? <p>{result.garments.length} closet {result.garments.length === 1 ? 'piece' : 'pieces'}: {result.garments.map((g) => g.name).join(', ')}</p> : <p className="dim">No closet pieces added.</p>}
      <div className="ac-buttons"><Btn kind="ghost" onClick={() => go('/trips/map')}>see my map</Btn><Btn kind="ghost" onClick={() => go('/style')}>see my closet</Btn><Btn kind="solid" onClick={onClose}>done</Btn></div>
    </section>
  )

  return (
    <section className="photo-import" aria-label="Import photos">
      <div className="pi-head">
        <h3 className="section-h">add photos</h3>
        <button className="link-btn" onClick={onClose}>close</button>
      </div>
      <p className="small dim">Photos are read on this device. Places go to your map; clothes you still own go to your closet.</p>
      <label className="pi-toggle"><input type="checkbox" checked={clothesOn} onChange={(e) => { const on = e.target.checked; setClothesOn(on); setDrafts((all) => all.map((d) => !on && d.clothes === 'queued' ? { ...d, clothes: 'off' } : on && d.clothes === 'off' ? { ...d, clothes: d.inCloset ? 'duplicate' : 'queued' } : d)) }} /> also look for clothes</label>
      <Btn kind="solid" icon="camera" disabled={!!reading} onClick={() => input.current?.click()}>{reading ? `reading ${reading.done} of ${reading.total}…` : drafts.length ? 'add more photos' : 'choose photos'}</Btn>
      <input ref={input} type="file" accept="image/*" multiple hidden aria-label="Photos to import" onChange={(e) => { void choose(e.target.files); e.target.value = '' }} />
      {errors.length > 0 && <ul className="small pi-errors" role="status">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}

      {drafts.some((d) => d.geocode === 'pending') && consent === 'ask' && (
        <div className="pi-consent" role="group" aria-label="Look up place names">
          <p className="small">{(() => { const c = drafts.filter((d) => d.geocode === 'pending').length; return `${c} ${c === 1 ? 'photo has' : 'photos have'}` })()} GPS but no place names. Look up the city and country? Only rounded coordinates (about 100 m) go to Photon by komoot, not the photos.</p>
          <div className="ac-buttons"><Btn kind="ghost" onClick={() => setConsent('yes')}>look up</Btn><Btn kind="ghost" onClick={() => setConsent('no')}>skip</Btn></div>
        </div>
      )}

      {drafts.length > 0 && <>
        {selected.size > 1 && (
          <div className="pi-bulk" role="group" aria-label="Same place for selected photos">
            <p className="small">Same place for {selected.size} selected photos:</p>
            {(['city', 'country'] as const).map((k) => <input key={k} className="chalk-input" placeholder={k} aria-label={`Selected photos ${k}`} value={bulk[k]} onChange={(e) => setBulk({ ...bulk, [k]: e.target.value })} />)}
            <Btn kind="ghost" onClick={() => { setDrafts((all) => all.map((d) => selected.has(d.id) ? (['city', 'country'] as const).reduce((n, k) => bulk[k].trim() ? setField(n, k, bulk[k].trim()) : n, d) : d)); setBulk({ place: '', city: '', country: '' }) }}>apply</Btn>
          </div>
        )}
        <ol className="pi-list">{drafts.map((d) => (
          <li key={d.id} className="pi-row">
            <div className="pi-photo">
              <input type="checkbox" aria-label={`Select ${d.fileName}`} checked={selected.has(d.id)} onChange={(e) => setSelected((s) => { const n = new Set(s); e.target.checked ? n.add(d.id) : n.delete(d.id); return n })} />
              <img src={d.image} alt="" />
              <div className="pi-file"><strong>{d.fileName}</strong>
                <span className="small dim">{d.lat !== undefined ? 'GPS in photo' : 'no GPS'}{d.inHistory ? ' · already on your map' : ''}</span>
              </div>
              <button className="link-btn" aria-label={`Remove ${d.fileName} from this import`} onClick={() => { files.current.delete(d.id); setDrafts((all) => all.filter((x) => x.id !== d.id)) }}>remove</button>
            </div>
            {!d.inHistory && <div className="pi-fields">
              <label><span>date{d.capturedAt ? (d.dateSource === 'exif' ? <em> · from photo</em> : null) : <em> · unknown</em>}{dateProblem(d, TODAY) ? <em> · in the future</em> : null}</span><input className="chalk-input" type="date" max={TODAY} aria-label={`Date for ${d.fileName}`} value={photoDay(d)} onChange={(e) => patch(d.id, (x) => ({ ...x, capturedAt: e.target.value ? `${e.target.value}T12:00:00` : '', dateSource: 'you' }))} /></label>
              {(['place', 'city', 'country'] as const).map((k) => (
                <label key={k}><span>{k}{d.sources[k] && SOURCE_LABEL[d.sources[k]!] ? <em> · {SOURCE_LABEL[d.sources[k]!]}</em> : null}</span><input className="chalk-input" aria-label={`${k[0].toUpperCase()}${k.slice(1)} for ${d.fileName}`} value={d.fields[k]} placeholder={k === 'place' ? 'optional' : ''} onChange={(e) => patch(d.id, (x) => setField(x, k, e.target.value))} /></label>
              ))}
              <p className="small dim">{d.geocode === 'looking' ? 'looking up place names…' : d.geocode === 'failed' ? <>{d.geocodeError} <button className="link-btn" onClick={() => patch(d.id, (x) => ({ ...x, geocode: 'pending' }))}>retry</button></> : d.geocode === 'nothing' ? 'No place name found for these coordinates.' : !d.fields.country.trim() ? 'Add a country to put this on your map, or leave it off.' : ''}</p>
            </div>}
            {d.clothes !== 'off' && <div className="pi-clothes">
              {d.clothes === 'queued' && <p className="small dim">waiting to look for clothes…</p>}
              {d.clothes === 'detecting' && <p className="small" role="status">looking for clothes… {modelStatus}</p>}
              {d.clothes === 'none' && <p className="small dim">No clothes found in this photo.</p>}
              {d.clothes === 'duplicate' && <p className="small dim">Pieces from this photo are already in your closet. <button className="link-btn" onClick={() => patch(d.id, (x) => ({ ...x, clothes: 'queued' }))}>look again</button></p>}
              {d.clothes === 'failed' && <p className="small">{d.clothesError} <button className="link-btn" onClick={() => patch(d.id, (x) => ({ ...x, clothes: 'queued', clothesError: undefined }))}>retry</button></p>}
              {d.pieces.map((p, i) => (
                <div className="pi-piece" key={i}>
                  <img src={p.image} alt="" />
                  <input className="chalk-input" placeholder="Name this piece…" aria-label={`Name of piece ${i + 1} in ${d.fileName}`} value={p.name} onChange={(e) => patch(d.id, (x) => ({ ...x, pieces: x.pieces.map((q, j) => j === i ? { ...q, name: e.target.value } : q) }))} />
                  <select aria-label={`Category of piece ${i + 1} in ${d.fileName}`} value={p.category} onChange={(e) => patch(d.id, (x) => ({ ...x, pieces: x.pieces.map((q, j) => j === i ? { ...q, category: e.target.value as GarmentCategory } : q) }))}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
                  <label className="small"><input type="checkbox" aria-label={`I still own piece ${i + 1} in ${d.fileName}`} checked={p.own} onChange={(e) => patch(d.id, (x) => ({ ...x, pieces: x.pieces.map((q, j) => j === i ? { ...q, own: e.target.checked } : q) }))} /> I still own it</label>
                </div>
              ))}
            </div>}
          </li>
        ))}</ol>

        <p className="small dim">Landmark recognition isn't available, so nothing is guessed from what's in the picture and no photo is sent to an AI service.</p>
        {problem && <p className="ac-problem" role="alert">{problem}</p>}
        <div className="ac-buttons pi-actions">
          <Btn kind="solid" disabled={busyClothes > 0 || geocoding || (!toMap.length && !pieces)} onClick={confirm}>
            {busyClothes ? `finding clothes… ${drafts.length - busyClothes} of ${drafts.length}` : `add ${toMap.length} to map${pieces ? ` · ${pieces} to closet` : ''}`}
          </Btn>
          {busyClothes > 0 && <Btn kind="ghost" onClick={() => setDrafts((all) => all.map((d) => d.clothes === 'queued' ? { ...d, clothes: 'off' } : d))}>skip remaining clothes</Btn>}
        </div>
      </>}
      {problem && !drafts.length && <p className="ac-problem" role="alert">{problem}</p>}
    </section>
  )
}
