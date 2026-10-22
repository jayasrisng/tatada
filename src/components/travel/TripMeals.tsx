import {useEffect,useRef,useState} from 'react'
import type {Trip} from '../../types'
import {useStore} from '../../state/store'
import {api,useServer} from '../../state/server'
import {directions,mealContext,mealItem,mealStops,parseMeals,type MealSlot} from '../../travel/context'
import type {ResearchAnswer} from '../assistant/ResearchPanel'
import {VoiceField} from '../assistant/VoiceField'
import {go} from '../../state/ui'
const prompt='Return only JSON {"meals":[{"day":"YYYY-MM-DD","meal":"breakfast|lunch|dinner","area":"neighborhood based on adjacent itinerary stops","options":[{"name":"venue","why":"route fit and detour","food":"specific dishes to consider","dietNote":"verified dietary fit or explicitly unknown","address":"venue address","url":"official supporting HTTPS source"}]}]}. Curate breakfast, lunch and dinner across the requested trip, 1–3 options each. Use the saved itinerary to determine the area at that meal time, including driving transitions, not just the destination center. Honor all dietary and personal needs. Check official menus, dates and hours with sources; never claim halal certification, allergy safety, accessibility or availability without evidence. If no confirmed match exists, say so in dietNote. Avoid duplicate already-saved meals and offer alternatives when needed. No invented coordinates or bookings.'
export function TripMeals({trip}:{trip:Trip}) {
 const {state,dispatch}=useStore(),{info}=useServer()
 const [request,setRequest]=useState('Find breakfast, lunch and dinner along my trip.'),[slots,setSlots]=useState<MealSlot[]>([]),[sources,setSources]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const saving=useRef(false)
 const version=useRef(0),context=mealContext(trip,state.profile)
 useEffect(()=>{if(saving.current){saving.current=false;return}version.current++;setSlots([]);setBusy(false);setError('')},[context]);useEffect(()=>()=>{version.current++},[])
 const saved=mealStops(trip)
 return <section className="trip-meals" aria-label="Meals along your route">
  {saved.length>0&&<><h3>On your itinerary</h3>{saved.map(s=><article className="meal-record" key={s.id}><strong>{s.title}</strong><p className="small dim">{s.day} · {s.time??'Flexible'}</p><a href={directions(s.title,trip.destination)} target="_blank" rel="noreferrer">Directions ↗</a><button className="linkbtn" onClick={()=>go(`/trip/${trip.id}/itinerary`)}>Open itinerary</button></article>)}</>}
  <details><summary>Find meals</summary><p className="small">Uses your route, dates and Profile preferences: {state.profile.diet.join(', ')||'no diet saved'}.</p>
  <form onSubmit={async e=>{e.preventDefault();const n=++version.current;setBusy(true);setError('');try{const answer=await api<ResearchAnswer>('/api/intelligence',{method:'POST',json:{context,question:prompt+'\nRequest: '+request.slice(0,1200)},signal:AbortSignal.timeout(100000)});if(n!==version.current)return;if(answer.incomplete)throw Error('The response was incomplete. Try one day at a time.');setSlots(parseMeals(answer.sections.map(s=>s.text).join('\n'),trip));setSources(answer.searched?answer.sections.flatMap(s=>s.sources.map(x=>x.url)):[])}catch(e){if(n===version.current)setError((e as Error).message)}finally{if(n===version.current)setBusy(false)}}}>
  <VoiceField label="Meal request" value={request} onChange={setRequest} maxLength={1200}/><button className="btn" disabled={busy||!request.trim()||!info.authenticated||info.provider!=='live'}>{busy?'Finding meals…':'Find options'}</button></form>
  {!info.authenticated&&<p className="small dim">Connect Wajo to use live research.</p>}{error&&<p role="alert">{error}</p>}
  {slots.map((slot,i)=><section key={i}><h3>{slot.day} · {slot.meal}</h3><p>{slot.area}</p>{slot.options.map((o,j)=><article className="meal-option" key={j}><h4>{o.name}</h4><p>{o.food}</p><p className="small">{o.why}</p><p className="small">{o.dietNote}</p><p className="small dim">{sources.includes(o.url)?'Source-linked suggestion; confirm hours and dietary needs.':'Unverified suggestion; confirm before choosing.'}</p><a href={directions(o.address||o.name,trip.destination)} target="_blank" rel="noreferrer">Directions ↗</a>{o.url&&<a href={o.url} target="_blank" rel="noreferrer">Menu / source ↗</a>}<button className="btn" disabled={saved.some(s=>s.day===slot.day&&s.title===mealItem(slot,o,'',false).title)} onClick={()=>{saving.current=true;dispatch({type:'saveItinerary',tripId:trip.id,item:mealItem(slot,o,crypto.randomUUID(),sources.includes(o.url))})}}>Add to itinerary</button></article>)}</section>)}
  </details>
 </section>
}
