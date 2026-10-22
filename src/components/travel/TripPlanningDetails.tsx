import {useEffect,useState} from 'react'
import type {Profile,Trip,TripPlanning} from '../../types'
import {useStore} from '../../state/store'
import {Btn} from '../layout/ui'
import {VoiceField} from '../assistant/VoiceField'
export function defaultPlanning(trip:Trip,profile:Profile):TripPlanning {
 return trip.planning??{origin:profile.homeBases?.[0]??'',transport:'other',arriveBy:'',homeBy:'',goals:trip.constraints.join('; ')}
}
export function TripPlanningDetails({trip}:{trip:Trip}) {
 const {state,dispatch}=useStore(),[draft,setDraft]=useState(()=>defaultPlanning(trip,state.profile)),[saved,setSaved]=useState(false)
 useEffect(()=>{setDraft(defaultPlanning(trip,state.profile))},[trip.id,trip.planning])
 const update=(patch:Partial<TripPlanning>)=>{setDraft(d=>({...d,...patch}));setSaved(false)}
 return <details className="planning-details"><summary>Route &amp; timing</summary><form onSubmit={e=>{e.preventDefault();dispatch({type:'saveTripPlanning',tripId:trip.id,planning:draft});setSaved(true)}}>
 <label>Starting from<input className="chalk-input" maxLength={150} value={draft.origin} onChange={e=>update({origin:e.target.value})} placeholder="San Francisco"/></label>
 <label>Getting there<select className="chalk-input" value={draft.transport} onChange={e=>update({transport:e.target.value as TripPlanning['transport']})}>{[['other','Decide with me'],['rental-car','Rent a car and drive'],['drive','Drive my car'],['flight','Fly'],['rail','Train / public transport']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
 <div className="date-row"><label>Arrive by (destination time)<input className="chalk-input" type="time" value={draft.arriveBy} onChange={e=>update({arriveBy:e.target.value})}/></label><label>Home / finish by (home time)<input className="chalk-input" type="time" value={draft.homeBy} onChange={e=>update({homeBy:e.target.value})}/></label></div>
 <VoiceField label="What matters to you?" maxLength={1600} value={draft.goals} onChange={goals=>update({goals})} placeholder="An easy hike, a good lunch, time to unwind."/><Btn type="submit">save trip preferences</Btn>{saved&&<p role="status">Saved.</p>}</form></details>
}
