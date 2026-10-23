import { Disclosure } from '../layout/Disclosure'
import {SecurityGate} from '../account/SecurityGate'
import {useEffect} from 'react'
import {api,useServer} from '../../state/server'
import { useRef, useState } from 'react'
import { parseSharedTrip, shareTrip, type SharedTrip } from '../../sharing/trip'
import { useStore } from '../../state/store'
import { uid } from '../../state/id'
import { go } from '../../state/ui'
import type { Trip } from '../../types'
import { Btn } from '../layout/ui'

function TripSharingContent({ trip }: { trip: Trip }) {
  const [notes, setNotes] = useState(false), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const {info}=useServer()
  const [reviewed,setReviewed]=useState(false),[link,setLink]=useState(''),[links,setLinks]=useState<{id:string;expiresAt:number;revokedAt?:number}[]>([])
  const snapshot = shareTrip(trip, notes)
  const reloadLinks=()=>api<{links:typeof links}>(`/api/shares?tripId=${encodeURIComponent(trip.id)}`).then(r=>setLinks(r.links))
  useEffect(()=>{if(info.available&&info.authenticated)void reloadLinks().catch(()=>setMessage('Share links could not load. Reconnect to manage them.'))},[trip.id,info.available,info.authenticated])
  useEffect(()=>{setReviewed(false);setLink('')},[trip,notes])
  return <div>
    <p className="small">Share the route, dates and daily plan. Choose an independent file or a view-only link that you can revoke.</p>
    <p className="small dim">Booking codes, documents and profile details stay private. Check the preview before sharing.</p>
    <label><input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} /> Include written journal notes</label>
    <details><summary>Preview shared information</summary><p>{snapshot.destination} · {snapshot.start}–{snapshot.end}</p><ul>{snapshot.itinerary.map((i) => <li key={i.id}>{i.day} {i.time} · {i.title}</li>)}</ul>{snapshot.notes?.map((n, i) => <p key={i}>{n.day} · {n.text}</p>)}</details>
    <label className="small"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> I reviewed exactly what will be shared</label>
    {info.available&&info.authenticated&&<Btn disabled={busy||!reviewed} onClick={async()=>{setBusy(true);try{const r=await api<{id:string;token:string;expiresAt:number}>('/api/shares',{method:'POST',json:{tripId:trip.id,snapshot,includeNotes:notes}});setLink(`${location.origin}${import.meta.env.BASE_URL}#/shared/${r.token}`);await reloadLinks();setMessage('View-only snapshot link created for 30 days. Anyone with the link can view it; downloaded copies cannot be revoked.')}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}}>create view-only link</Btn>}
    {link&&<label>Share this link<input placeholder="Enter view-only trip link…" className="chalk-input" aria-label="View-only trip link" value={link} readOnly onFocus={e=>e.target.select()}/></label>}
    {links.map(l=><p className="small" key={l.id}>Link ending {l.id.slice(-5)} · {l.revokedAt?'revoked':`expires ${new Date(l.expiresAt).toLocaleDateString()}`} {!l.revokedAt&&<button className="linkbtn" disabled={busy} onClick={async()=>{setBusy(true);try{await api(`/api/shares/${l.id}/revoke`,{method:'POST',json:{}});setLink('');await reloadLinks()}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}}>revoke</button>}</p>)}
    {!info.available&&<p className="small dim">Revocable links need the deployed Tatada backend. A file works independently and cannot be revoked.</p>}
    <Btn data-tour="share-trip-file" disabled={busy||!reviewed} onClick={async () => {
      setBusy(true); setMessage('')
      try {
        const file = new File([JSON.stringify(snapshot, null, 2)], `tatada-${trip.destination.replace(/[^a-z0-9-]/gi, '-').slice(0, 50)}.tatada-trip.json`, { type: 'application/json' })
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: `A little trip to ${trip.destination}` })
        else { const url = URL.createObjectURL(file), a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage('Downloaded. Send this file to your friend; they can open it from Trips → Import. Downloaded copies cannot be revoked.') }
        window.dispatchEvent(new Event('tatada-trip-exported'))
      } catch (e) { if ((e as Error).name !== 'AbortError') setMessage('Could not share. Try downloading from a browser that supports file downloads.') } finally { setBusy(false) }
    }}>share trip file</Btn>
    {message && <p role="status" className="small">{message}</p>}
  </div>
}
export function SharedTripImport({compact=false}:{compact?:boolean}={}) {
  const { dispatch } = useStore(), input = useRef<HTMLInputElement>(null)
  const [trip, setTrip] = useState<SharedTrip | null>(null), [error, setError] = useState('')
  return <section className="share-panel"><button className="linkbtn" onClick={() => input.current?.click()}>{compact?'Import':'open a shared trip'}</button>
    <input ref={input} type="file" hidden accept="application/json,.json" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setError(''); setTrip(null); try { if (f.size > 1_000_000) throw new Error('File is too large.'); setTrip(parseSharedTrip(await f.text())) } catch (e) { setError((e as Error).message) } }} />
    {trip && <><h3>{trip.destination}</h3><p>{trip.start}–{trip.end} · {trip.itinerary.length} itinerary items</p><ul>{trip.itinerary.map((i) => <li key={i.id}>{i.day} · {i.title}</li>)}</ul><p className="small dim">Your copy will be independent. No bookings or payments are made.</p><Btn onClick={() => {
      const id = uid()
      const copy: Trip = { id, destination: trip.destination, country: trip.country, start: trip.start, end: trip.end, travelers: 1, companions: 'solo', budget: 0, vibe: [], constraints: [], discounts: [], status: trip.end < new Date().toLocaleDateString('en-CA') ? 'past' : 'planning', tint: 'blue', summary: {}, options: [], bookings: [], memories: (trip.notes ?? []).map((n) => ({ ...n, id: uid(), kind: 'note' })), itinerary: trip.itinerary.map((i) => ({ ...i, id: uid() })) }
      dispatch({ type: 'addTrip', trip: copy, items: [] }); setTrip(null); go(`/trip/${id}`)
    }}>keep my own copy</Btn><button className="linkbtn" onClick={() => setTrip(null)}>close</button></>}
    {error && <p role="alert">{error}</p>}
  </section>
}

export function TripSharing(props:{trip:Trip;inline?:boolean}){const {info}=useServer();if(info.prototype)return <p className="small">Public share links are disabled for this private prototype.</p>;return <Disclosure inline={props.inline} className="share-panel" title="Share trip"><SecurityGate><TripSharingContent trip={props.trip}/></SecurityGate></Disclosure>}
