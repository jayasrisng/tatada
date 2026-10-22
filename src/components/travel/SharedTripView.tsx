import { useEffect, useState } from 'react'
import { apiUrl } from '../../config'
import { parseSharedTrip, type SharedTrip } from '../../sharing/trip'
export function SharedTripView({ token }: { token: string }) {
  const [trip,setTrip]=useState<SharedTrip|null>(null),[error,setError]=useState('')
  useEffect(()=>{let live=true;setTrip(null);setError('');const abort=new AbortController();fetch(apiUrl(`/api/shared/${encodeURIComponent(token)}`),{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:abort.signal}).then(async r=>{if(!r.ok)throw new Error('This trip link is unavailable, expired or revoked.');const j=await r.json();return parseSharedTrip(JSON.stringify(j.trip))}).then(t=>{if(live)setTrip(t)}).catch(e=>{if(live)setError(e.message)});return()=>{live=false;abort.abort()}},[token])
  return <div className="frame"><main className="app"><div className="screen"><p className="logo">tatada</p><p className="small dim">A friend’s saved trip · view only</p>{trip?<><h1>{trip.destination}</h1><p>{trip.start} – {trip.end}</p><p className="small dim">Snapshot shared {trip.exportedAt.slice(0,10)}. No live reservations or private account access.</p>{trip.itinerary.map(i=><p key={i.id}>{i.day} {i.time} · {i.title}</p>)}{trip.notes?.map((n,i)=><p key={i}>{n.day} · {n.text}</p>)}</>:<p role="status">{error||'Opening shared trip…'}</p>}</div></main></div>
}
