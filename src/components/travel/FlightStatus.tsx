import { useState } from 'react'
import type { Booking, Trip } from '../../types'
import { api } from '../../state/server'
type Status={provider:string;environment:string;checkedAt:string;flights:{points:{airport?:string;departure?:{kind?:string;time?:string}[];arrival?:{kind?:string;time?:string}[]}[]}[]}
export function FlightStatus({trip,booking}:{trip:Trip;booking:Booking}) {
 const [busy,setBusy]=useState(false),[result,setResult]=useState<Status|null>(null),[error,setError]=useState('')
 return <div className="flight-status"><button className="linkbtn small" disabled={busy||booking.simulated} onClick={async()=>{setBusy(true);setError('');try{setResult(await api<Status>('/api/travel/flight-status',{method:'POST',json:{tripId:trip.id,bookingId:booking.id}}))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>{busy?'checking provider…':'check provider schedule'}</button>
 {result&&<><p className="small dim">{result.provider} · {result.environment==='test'?'test data, not live status':'provider data'} · checked {new Date(result.checkedAt).toLocaleString()}</p>{!result.flights.length&&<p className="small">No matching flight returned. Check with your airline.</p>}{result.flights.map((f,i)=><div key={i}>{f.points.map((p,j)=><p className="small" key={j}>{p.airport} {p.departure?.map(t=>`${t.kind??''}: ${t.time??'unknown'}`).join(' · ')} {p.arrival?.map(t=>`${t.kind??''}: ${t.time??'unknown'}`).join(' · ')}</p>)}</div>)}<p className="small dim">Saved reservation unchanged. Check airline notices for boarding.</p></>}{error&&<p role="status" className="small">{error}</p>}
 </div>
}
