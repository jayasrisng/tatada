import {requestTripLocation} from '../../assistant/conversation'
import {useEffect,useId,useRef,useState} from 'react'
import type {ItineraryItem,Trip} from '../../types'
import {useStore} from '../../state/store'
import {reducer,type Act} from '../../state/reducer'
import {api,useServer} from '../../state/server'
import {itineraryPrompt,parseTripPlan,planningContext,remainingPlan,selectedPlanItems} from '../../assistant/itinerary'
import {stopScope} from '../../assistant/stop'
import type {ResearchAnswer} from '../assistant/ResearchPanel'
import {VoiceField} from '../assistant/VoiceField'
import {Doodle} from '../layout/Doodle'
import {Btn} from '../layout/ui'

type Turn={role:'you'|'magic';text:string}
export function StopMagic({trip,stop}:{trip:Trip;stop:ItineraryItem}) {
 const {state,dispatch}=useStore(),{info}=useServer(),id=useId()
 const [shareLocation,setShareLocation]=useState(false)
 const [open,setOpen]=useState(false),[text,setText]=useState(''),[turns,setTurns]=useState<Turn[]>(()=> (trip.conversation??[]).filter(t=>t.stopId===stop.id).map(t=>({role:t.from==='you'?'you':'magic',text:t.text}))),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const [undo,setUndo]=useState<{before:Trip;expected:string}>()
 const input=useRef<HTMLTextAreaElement>(null),latest=useRef({trip,profile:state.profile}),controller=useRef<AbortController|null>(null),active=useRef(false)
 latest.current={trip,profile:state.profile}
 useEffect(()=>()=>{controller.current?.abort();active.current=false},[])
 useEffect(()=>{if(!active.current)setTurns((trip.conversation??[]).filter(t=>t.stopId===stop.id).map(t=>({role:t.from==='you'?'you':'magic',text:t.text})))},[trip.conversation,stop.id])
 const remember=(from:'you'|'magic',text:string)=>dispatch({type:'appendTripConversation',tripId:trip.id,turns:[{id:crypto.randomUUID(),stopId:stop.id,from,text,at:new Date().toISOString()}]})
 const fingerprint=(value:{trip:Trip;profile:typeof state.profile})=>JSON.stringify({...value,trip:{...value.trip,conversation:undefined}})
 async function send(){
  const message=text.trim();if(!message||busy||active.current)return
  if(!info.authenticated||info.provider!=='live'){setError('Connect your account in Profile to use Magic.');return}
  const snapshot=fingerprint({trip,profile:state.profile}),abort=new AbortController();controller.current=abort;active.current=true
  setBusy(true);setError('');remember('you',message);setTurns(old=>[...old,{role:'you',text:message}]);setText('')
  try {
   const point=shareLocation?await requestTripLocation():undefined
   const context=planningContext(trip,state.profile)+(point?`\nApproximate location shared for this change: ${JSON.stringify(point)}`:'')
   const scope=stopScope(trip,stop.id)
   const question=`${itineraryPrompt}\nEdit the itinerary directly from the selected stop: ${JSON.stringify({id:stop.id,day:stop.day,time:stop.time,title:stop.title,done:stop.done})}. Preserve every earlier stop and all checked-off stops. Return the SAME JSON schema, plus top-level "reply" (one short sentence explaining the actual change) and OPTIONAL "finishedAt" (HH:mm). Set finishedAt ONLY if the traveler explicitly says this selected stop is finished and supplies its actual finish time. Otherwise revise this selected stop and later unfinished stops. Do not assume a delay or completion. Keep required transfers and the home deadline. Write stop titles as short action sentences. If the request is a question, ambiguous, or cannot safely change the route, return only {"reply":"answer or one clarifying question","noChange":true}. Never put completed/earlier stops in the new plan. Recent chat: ${JSON.stringify(turns.slice(-4)).slice(0,400)}\nTraveler: ${message.slice(0,1000)}`
   const result=await api<ResearchAnswer>('/api/intelligence',{method:'POST',json:{purpose:'itinerary',context,question},signal:AbortSignal.any([abort.signal,AbortSignal.timeout(160000)])})
   if(abort.signal.aborted)return
   if(result.incomplete)throw Error('Magic could not finish the update. Your itinerary is unchanged.')
   if(fingerprint(latest.current)!==snapshot)throw Error('Your trip changed while Magic was working. Send the change again using the updated route.')
   const answer=result.sections.map(s=>s.text).join('\n'),block=answer.match(/```(?:json|tatada-itinerary)\s*\n([\s\S]*?)```/)
   const meta=JSON.parse(block?block[1]:answer.trim()) as {reply?:unknown;noChange?:unknown;finishedAt?:unknown}
   const reply=typeof meta.reply==='string'?meta.reply.slice(0,900):'Your itinerary is updated from this stop.'
   if(meta.noChange===true){setShareLocation(false);remember('magic',reply);setTurns(old=>[...old,{role:'magic',text:reply}]);return}
   if(meta.finishedAt!==undefined&&typeof meta.finishedAt!=='string')throw Error('Magic returned an invalid finish time. Your itinerary is unchanged.')
   const boundary=meta.finishedAt?stopScope(trip,stop.id,meta.finishedAt):scope
   const parsed=remainingPlan(parseTripPlan(answer,trip.start,trip.end,true),boundary,boundary.preserved)
   const sources=new Set(result.sections.flatMap(s=>s.sources.map(source=>source.url)))
   for(const day of parsed.days)for(const part of day.stops)for(const o of part.options)if(!o.url||!sources.has(o.url)){delete o.rating;delete o.distance}
   const items=selectedPlanItems(parsed,{},crypto.randomUUID())
   if(!items.length)throw Error('Magic did not return a remaining route. Your itinerary is unchanged.')
   // Retain the inline conversation when the selected stop itself is edited.
   if(!meta.finishedAt&&!stop.done&&items[0].day===stop.day)items[0].id=stop.id
   const action:Act={type:'saveItineraryPlan',tripId:trip.id,items,replaceIds:boundary.replaceIds,guide:parsed.essentials?{...parsed.essentials,checkedAt:result.checkedAt}:undefined}
   let updated=reducer(state,action)
   dispatch(action)
   if(meta.finishedAt&&!stop.done){const done:Act={type:'toggleStop',tripId:trip.id,id:stop.id};updated=reducer(updated,done);dispatch(done)}
   const next=updated.trips.find(t=>t.id===trip.id)!
   setUndo({before:trip,expected:JSON.stringify([next.itinerary,next.planGuide])})
   setShareLocation(false);remember('magic',reply);setTurns(old=>[...old,{role:'magic',text:reply}])
  }catch(e){if(!abort.signal.aborted){setError((e as Error).message);setText(message)}}finally{active.current=false;setBusy(false)}
 }
 function undoChange(){
  if(!undo)return
  if(JSON.stringify([trip.itinerary,trip.planGuide])!==undo.expected){setError('Your route changed again. Ask Magic for another adjustment instead of undoing newer changes.');return}
  dispatch({type:'restoreItineraryPlan',tripId:trip.id,expected:undo.expected,items:undo.before.itinerary??[],guide:undo.before.planGuide})
  setUndo(undefined);remember('magic','Your previous itinerary is restored.');setTurns(old=>[...old,{role:'magic',text:'Your previous itinerary is restored.'}])
 }
 return <div className="stop-magic">
  <button type="button" className={`iconbtn stop-magic-trigger${open?' on':''}`} aria-label={`Magic for ${stop.title}`} aria-expanded={open} aria-controls={id} onClick={()=>{setOpen(v=>!v);if(!open)requestAnimationFrame(()=>input.current?.focus())}}><Doodle name="sparkle" size={23}/></button>
  {open&&<section className="stop-inline-chat" id={id} aria-label={`Chat about ${stop.title}`}>
   <p className="small dim">Change this stop or what comes next. Updates save here as soon as Magic finishes.</p>
   <div role="log" aria-live="polite" className="stop-chat-turns">{turns.map((turn,i)=><p key={i} className={`small ${turn.role}`}><strong>{turn.role==='you'?'You':'Magic'}</strong> {turn.text}</p>)}</div>
   <form onSubmit={e=>{e.preventDefault();void send()}}><VoiceField inputRef={input} ariaLabel={`Message Magic about ${stop.title}`} value={text} onChange={setText} disabled={busy} maxLength={1000} required placeholder="Make this hike shorter, change lunch, or tell me what happened…"/><label className="small planner-replace"><input type="checkbox" checked={shareLocation} disabled={busy} onChange={e=>setShareLocation(e.target.checked)}/> Share my approximate location with Claude for this change</label><Btn type="submit" disabled={busy||!text.trim()}>{busy?'updating…':'send'}</Btn></form>
   {undo&&!busy&&<button type="button" className="linkbtn small" onClick={undoChange}>undo last update</button>}
   {busy&&<p role="status" className="small">Checking and updating your remaining route…</p>}{error&&<p role="alert" className="small">{error}</p>}
  </section>}
 </div>
}
