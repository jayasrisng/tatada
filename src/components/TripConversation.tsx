import {lazy,Suspense,useEffect,useRef,useState} from 'react'
import type {Trip,TripTurn} from '../types'
import {useStore,uid} from '../state/store'
import {api,useServer} from '../state/server'
import {planningContext} from '../assistant/itinerary'
import {tripTool,requestTripLocation,type TripTool} from '../assistant/conversation'
import {FlightSearch} from './FlightSearch'
import {ResearchPanel,type ResearchAnswer} from './ResearchPanel'
import {ConfirmationImport} from './ConfirmationImport'
import {VoiceField} from './VoiceField'
import {Btn} from './ui'
const FlightTicket=lazy(()=>import('./FlightTicket').then(m=>({default:m.FlightTicket})))
export function TripConversation({trip,onPlan}:{trip:Trip;onPlan:(message:string)=>void}) {
 const {state,dispatch}=useStore(),{info}=useServer()
 const [text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[tool,setTool]=useState<TripTool>('chat'),[location,setLocation]=useState(false),[lastRequest,setLastRequest]=useState('')
 const active=useRef(false),controller=useRef<AbortController|null>(null),latest=useRef(trip.id),log=useRef<HTMLDivElement>(null);latest.current=trip.id
 useEffect(()=>()=>controller.current?.abort(),[])
 useEffect(()=>{log.current?.scrollTo({top:log.current.scrollHeight,behavior:'smooth'})},[trip.conversation?.length])
 const add=(from:TripTurn['from'],message:string)=>dispatch({type:'appendTripConversation',tripId:trip.id,turns:[{id:uid(),from,text:message,at:new Date().toISOString()}]})
 async function send(){
  const message=text.trim();if(!message||active.current)return
  const intent=tripTool(message);setTool(intent);setLastRequest(message);setError('')
  if(intent!=='chat'){
   add('you',message);setText('')
   if(intent==='plan'){add('magic','I’ll build your days from the agreed requirements and saved arrangements. Choose your preferred options below.');onPlan(message)}
   else add('magic',intent==='flights'?'Let’s check the route, dates and traveler count below. Fare results name their provider; seller links are separate comparisons.':intent==='stays'?'I’ll research stays for your dates and preferences. Only source-supported prices should be treated as quotes.':'Complete checkout with the provider, then import the actual confirmation here. Saved flight notes are not an airline boarding pass.')
   return
  }
  if(!info.authenticated||info.provider!=='live'){setError('Connect your account in Profile to talk through this trip.');return}
  const abort=new AbortController();controller.current=abort;active.current=true;setBusy(true)
  try{
   const point=location?await requestTripLocation():undefined
   const context=planningContext(trip,state.profile)+(point?`\nApproximate location shared for this message: ${JSON.stringify(point)}`:'')
   const result=await api<ResearchAnswer>('/api/intelligence',{method:'POST',json:{context,question:`Continue this trip conversation. Answer the latest message and ask only necessary follow-up questions. If a route change is needed, direct the traveler to the Magic icon at that stop or to build/update the itinerary. No bookings, purchases or check-in actions. Never claim that seller sites or prices were checked without actual citations. Recent conversation: ${JSON.stringify((trip.conversation??[]).filter(t=>!t.stopId).slice(-4).map(t=>({from:t.from,text:t.text.slice(0,450)}))).slice(0,1800)}\nTraveler: ${message.slice(0,1000)}`},signal:AbortSignal.any([abort.signal,AbortSignal.timeout(100000)])})
   if(abort.signal.aborted||latest.current!==trip.id)return
   if(result.incomplete)throw Error('The reply was incomplete. Please try again.')
   add('you',message);add('magic',result.sections.map(s=>s.text).join('\n'));setText('');setLocation(false)
  }catch(e){if(!abort.signal.aborted)setError((e as Error).message)}finally{active.current=false;setBusy(false)}
 }
 return <details className="trip-conversation" open={!trip.itinerary?.length}><summary>Talk through this trip</summary>
  <div ref={log} className="trip-conversation-log" role="log" aria-live="polite">{(trip.conversation??[]).filter(t=>!t.stopId).slice(-16).map(turn=><p key={turn.id} className={turn.from}><strong>{turn.from==='you'?'You':'Magic'}</strong>{turn.text}</p>)}</div>
  <form onSubmit={e=>{e.preventDefault();void send()}}><VoiceField ariaLabel="Message about this trip" value={text} onChange={setText} maxLength={1000} required disabled={busy} placeholder="Check flights, find a stay, build my days, or talk through a change…"/><label className="small planner-replace"><input type="checkbox" checked={location} disabled={busy} onChange={e=>setLocation(e.target.checked)}/> Share my approximate location with Claude for this reply</label><Btn type="submit" disabled={busy||!text.trim()}>{busy?'thinking…':'send'}</Btn></form>
  <div className="planner-prompts">{['Check flights','Find hotels or Airbnbs','Build my itinerary','Add a confirmation'].map(label=><button type="button" key={label} disabled={busy} onClick={()=>setText(label)}>{label}</button>)}</div>
  {error&&<p role="alert">{error}</p>}
  {tool==='flights'&&<FlightSearch key={lastRequest} trip={trip} autoSearch direction={/\breturn\b/i.test(lastRequest)?'return':'outbound'} route={lastRequest.match(/\b([A-Z]{3})\s*(?:to|→|-)\s*([A-Z]{3})\b/)?.slice(1,3)}/>}
  {tool==='stays'&&<ResearchPanel auto key={lastRequest} onSave={answer=>dispatch({type:'saveResearch',tripId:trip.id,note:{id:uid(),...answer}})} title="Stay options for this trip" context={planningContext(trip,state.profile)} prompt={`Find 2–3 suitable hotels or Airbnb options for ${trip.destination}, ${trip.start} to ${trip.end}, ${trip.travelers} travelers. ${lastRequest} Compare location, total cost including fees, cancellation, accessibility and fit. Search official property, Airbnb or seller pages. Show exact-date prices only if verified; otherwise say price unavailable. Name each source actually checked and link to the relevant listing. Do not claim a booking or exhaustive cheapest result.`}/>}
  {tool==='confirmation'&&<><ConfirmationImport trip={trip}/><Suspense fallback={<p>Opening saved flight details…</p>}>{trip.bookings.filter(b=>b.kind==='flight').map(b=><FlightTicket key={b.id} booking={b} trip={trip} profile={state.profile}/>)}</Suspense></>}
 </details>
}
