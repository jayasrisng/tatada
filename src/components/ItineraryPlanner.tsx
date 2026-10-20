import {TripConversation} from './TripConversation'
import {StopMagic} from './StopMagic'
import {StopDetails} from './StopDetails'
import {stopSentence} from '../assistant/stop'
import {useEffect,useRef,useState} from 'react'
import type {Trip} from '../types'
import {useStore} from '../state/store'
import {api,useServer} from '../state/server'
import {useUI,hashQuery} from '../state/ui'
import {TripPlanningDetails} from './TripPlanningDetails'
import {TripGuide} from './TripGuide'
import {TripPreparation} from './TripPreparation'
import {fmtDay,fmtTime,localToday} from '../magic/dates'
import {itineraryPrompt,parseTripPlan,planningContext,planDays,selectedPlanItems,type TripPlan} from '../assistant/itinerary'
import type {ResearchAnswer} from './ResearchPanel'
import {VoiceField} from './VoiceField'
import {Btn} from './ui'

export function ItineraryPlanner({trip}:{trip:Trip}) {
 const {state,dispatch}=useStore(),{info}=useServer(),{openMagic}=useUI()
 const [request,setRequest]=useState(''),[plan,setPlan]=useState<TripPlan>(),[choices,setChoices]=useState<Record<string,number>>({})
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[checked,setChecked]=useState('')
 const [replaceRemaining,setReplaceRemaining]=useState(false),[editing,setEditing]=useState(!trip.itinerary?.length)
 const [planSnapshot,setPlanSnapshot]=useState('')
 const autoStarted=useRef(false),generation=useRef(0),requestInput=useRef<HTMLTextAreaElement>(null)
 useEffect(()=>()=>{generation.current++},[])
 let context='',dateError=''
 try {context=planningContext(trip,state.profile)} catch(e){dateError=(e as Error).message}
 const relevant=JSON.stringify([trip.start,trip.end,trip.destination,trip.country,trip.budget,trip.vibe,trip.localAddress,trip.arrival,state.profile.diet,state.profile.style,state.profile.homeAirport,trip.constraints,trip.discounts,trip.planning,trip.itinerary])
 useEffect(()=>{generation.current++;setPlan(undefined);setChoices({});setSaved(false);setBusy(false);setError('')},[relevant])
 async function generate(brief=request,revision=replaceRemaining){
  if(busy||dateError||!info.authenticated||info.provider!=='live')return
  const version=++generation.current;setPlanSnapshot(JSON.stringify(trip.itinerary));setBusy(true);setError('');setPlan(undefined);setSaved(false)
  try {
   const result=await api<ResearchAnswer>('/api/intelligence',{method:'POST',json:{purpose:'itinerary',context,question:`${itineraryPrompt}\nTraveler request: ${revision?'Revise my remaining plan based on the change below. Keep completed stops unchanged.':'Add only new stops around saved arrangements.'} ${brief.slice(0,1600)||'Build a destination-specific route from my saved preferences.'}`},signal:AbortSignal.timeout(160000)})
   if(version!==generation.current)return
   if(result.incomplete)throw Error('The plan was cut short. Try a simpler request.')
   const parsed=parseTripPlan(result.sections.map(s=>s.text).join('\n'),trip.start,trip.end,revision)
   const cited=new Set(result.sections.flatMap(s=>s.sources.map(source=>source.url)))
   for(const day of parsed.days)for(const stop of day.stops)for(const option of stop.options)if(!option.url||!cited.has(option.url)){delete option.rating;delete option.distance}
   setPlan(parsed);setChoices({});setChecked(result.checkedAt)
  }catch(e){if(version===generation.current)setError((e as Error).message)}finally{if(version===generation.current)setBusy(false)}
 }
 useEffect(()=>{
  let mounted=true
  // Wait until mount effects settle so StrictMode cannot start duplicate research.
  queueMicrotask(()=>{
   if(!mounted||autoStarted.current||hashQuery().get('plan')!=='auto'||trip.itinerary?.length||dateError||!info.authenticated||info.provider!=='live')return
   autoStarted.current=true
   const query=hashQuery();query.delete('plan')
   window.history.replaceState(null,'',window.location.pathname+window.location.search+window.location.hash.split('?')[0]+(query.size?'?'+query.toString():''))
   const brief=trip.planning?.goals||trip.constraints.join('; ')
   setRequest(brief);setEditing(true);void generate(brief)
  })
  return()=>{mounted=false}
 },[info.authenticated,info.provider,trip.id,trip.itinerary?.length,dateError])
 function revise(){setReplaceRemaining(true);setEditing(true);setRequest('');requestAnimationFrame(()=>requestInput.current?.focus())}
 function save(){
  if(!plan)return
  try{
   if(planSnapshot!==JSON.stringify(trip.itinerary))throw Error('Your itinerary changed while planning. Generate a fresh revision.')
   const items=selectedPlanItems(plan,choices,crypto.randomUUID()).filter(i=>!replaceRemaining||i.day>=localToday()).filter(i=>!trip.itinerary?.some(old=>old.done&&old.day===i.day&&old.title===i.title))
   if(!items.length)throw Error('Choose at least one stop to save.')
   dispatch({type:'saveItineraryPlan',tripId:trip.id,items,guide:plan.essentials?{...plan.essentials,checkedAt:checked}:undefined,replaceFrom:replaceRemaining?localToday():undefined})
   setSaved(true);setPlan(undefined);setEditing(false);setError('')
  }catch(e){setError((e as Error).message)}
 }
 const hasStops=!!trip.itinerary?.length
 return <section className="itinerary-planner" aria-label="Your itinerary">
  <TripConversation trip={trip} onPlan={message=>{setRequest(message);setReplaceRemaining(hasStops);setEditing(true);void generate(message,hasStops)}}/>
  <header className="itinerary-heading"><div><h2>Your itinerary</h2><p className="small dim">Things to do. Places to eat. Room to explore.</p></div>{hasStops&&<button type="button" className="linkbtn small" disabled={busy} onClick={revise}>change plans</button>}</header>
  {saved&&<p className="small" role="status">Your plan is saved.</p>}
  {!dateError&&hasStops&&!plan&&<div className="saved-day-plan">{planDays(trip.start,trip.end).map(day=><article className="itinerary-day" key={day}>
   <h3>{fmtDay(day)}</h3>{(trip.itinerary??[]).filter(s=>s.day===day).sort((a,b)=>(a.time??'99').localeCompare(b.time??'99')).map((stop,index,stops)=><div className={`saved-plan-stop${stop.done?' is-done':''}`} key={stop.id}>
    <label className="itinerary-stop-main"><input type="checkbox" checked={!!stop.done} aria-label={`Done: ${stop.title}`} onChange={()=>dispatch({type:'toggleStop',tripId:trip.id,id:stop.id})}/><span><time>{stop.time?fmtTime(stop.time):'Flexible'}</time><strong>{stopSentence(stop.title)}</strong></span></label>
    <StopDetails stop={stop} trip={trip} previous={stops[index-1]} onRemove={()=>dispatch({type:'deleteItinerary',tripId:trip.id,id:stop.id})}/>
    <StopMagic trip={trip} stop={stop}/>

   </div>)}{!trip.itinerary?.some(s=>s.day===day)&&<p className="small dim">Leave it open, or add something you’d enjoy.</p>}
  </article>)}</div>}
  <details className={`itinerary-editor${hasStops?' has-plan':''}`} open={editing} onToggle={e=>setEditing(e.currentTarget.open)}><summary>{hasStops?'Plan or change something':'Make my plan'}</summary>
   <form onSubmit={e=>{e.preventDefault();void generate()}}>

    <VoiceField label={replaceRemaining?'What changed?':'What would you like to do?'} inputRef={requestInput} value={request} onChange={value=>{setRequest(value);setPlan(undefined)}} maxLength={1600} disabled={busy} placeholder={replaceRemaining?'Running late? A trail closed? Tell me what happened.':trip.start===trip.end?'A day outdoors, one easy hike and a good lunch. Home by evening.':'A few places to explore, food I’ll enjoy, and a relaxed pace…'}/>
    {!replaceRemaining&&<div className="planner-prompts" aria-label="Planning ideas">{['Things to do','Places to eat','Places to go'].map(text=><button type="button" key={text} disabled={busy} onClick={()=>{setRequest(old=>[old,`Help me choose ${text.toLowerCase()}.`].filter(Boolean).join(' ').slice(0,1600));requestInput.current?.focus()}}>{text}</button>)}</div>}
    <div className="ac-buttons"><Btn type="submit" disabled={busy||!!dateError||!info.authenticated||info.provider!=='live'}>{busy?'planning…':replaceRemaining?'update my plan':'make my plan'}</Btn><button type="button" className="linkbtn" onClick={()=>openMagic({tripId:trip.id,assistant:true,prefill:`Help with my trip and saved itinerary. ${trip.planning?.transport==='drive'||trip.planning?.transport==='rental-car'?'This is a driving trip.':''} ${request||'Help me decide what to do, where to eat and where to go.'} Ask me before changing plans. Do not book anything.`})}>talk to Fo</button></div>
    {hasStops&&<label className="planner-replace small"><input type="checkbox" checked={replaceRemaining} disabled={busy} onChange={e=>{setReplaceRemaining(e.target.checked);setPlan(undefined)}}/> replace remaining stops</label>}
    <details className="planning-context-details"><summary>Trip details used</summary><p className="small dim">Shared with Claude for this request.</p><pre className="planning-context">{context||dateError}</pre></details>
   </form>
   <TripPlanningDetails trip={trip}/>
  </details>
  {busy&&<p role="status" className="small dim">Checking your route and sources…</p>}
  {!info.authenticated&&editing&&<p className="small dim">Connect your account in Profile to plan.</p>}
  {(error||dateError)&&<p role="alert">{error||dateError}</p>}
  {plan&&<div className="planner-choices" aria-live="polite"><h3>Pick your favorites</h3>{plan.days.map(d=><article className="planner-day" key={d.day}><h3>{fmtDay(d.day)}</h3>{d.stops.map((stop,i)=>{const key=`${d.day}:${i}`;return <fieldset key={key}><legend>{stop.time?fmtTime(stop.time):'Flexible'}</legend>{stop.options.map((o,j)=><div className="planner-option" key={j}><label><input type="radio" name={key} checked={(choices[key]??0)===j} onChange={()=>setChoices(c=>({...c,[key]:j}))}/><strong>{o.title}</strong></label><details><summary>why this fits</summary><p>{o.note}</p>{(o.rating||o.distance)&&<p className="small">{[o.rating&&`Rating: ${o.rating}`,o.distance].filter(Boolean).join(' · ')}</p>}{o.url&&<a href={o.url} target="_blank" rel="noreferrer" className="small">source ↗</a>}</details></div>)}<label className="small"><input type="radio" name={key} checked={choices[key]===-1} onChange={()=>setChoices(c=>({...c,[key]:-1}))}/> leave this open</label></fieldset>})}</article>)}
   {replaceRemaining&&<p className="small dim">This replaces unfinished stops from today onward. Completed stops stay.</p>}<Btn onClick={save}>save my choices</Btn>
   {plan.essentials&&<TripGuide guide={{...plan.essentials,checkedAt:checked}}/>}
  </div>}
  {!plan&&<TripPreparation trip={trip}/>}
 </section>
}
