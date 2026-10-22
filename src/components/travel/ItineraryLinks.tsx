import type {Trip} from '../../types'
import {stopKind,directions,type StopKind} from '../../travel/context'
import {go} from '../../state/ui'
export function ItineraryLinks({trip,kind}:{trip:Trip;kind:StopKind}) {
 const stops=(trip.itinerary??[]).filter(s=>{const k=stopKind(s.title);return kind==='activity'?['activity','waterfall','work'].includes(k):k===kind})
 if(!stops.length)return null
 return <section aria-label="From your itinerary"><h3>On your itinerary</h3>{stops.map(s=><article className="meal-record" key={s.id}><strong>{s.title}</strong><p className="small dim">{s.day} · {s.time??'Flexible'} · planned, not a reservation</p><a href={directions(s.title,trip.destination)} target="_blank" rel="noreferrer">Directions ↗</a><button className="linkbtn" onClick={()=>go(`/trip/${trip.id}/itinerary`)}>Open itinerary</button></article>)}</section>
}
