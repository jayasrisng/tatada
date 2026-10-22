import {api,useServer} from '../state/server'
import type {ResearchAnswer} from '../components/ResearchPanel'
import {buildIntakeContext,intakePrompt,parseIntake,type IntakeDraft} from '../assistant/intake'
import { useState,useRef,useEffect } from 'react'
import { uid, useStore } from '../state/store'
import { go } from '../state/ui'
import { Btn, Chip, TopBar } from '../components/ui'
import { FoVoice } from '../components/FoVoice'
import { VoiceField } from '../components/VoiceField'
import { ResearchPanel } from '../components/ResearchPanel'
import type { ChecklistItem, Trip, TripPlanning,TripTurn } from '../types'
import { addDays, isIsoDate, localToday, nightsBetween } from '../magic/dates'

export function dateProblem(start: string, end: string, today = localToday()): string | null {
  if (!isIsoDate(start) || !isIsoDate(end)) return 'Pick both dates.'
  if (start < today) return 'The trip can\'t start in the past.'
  if (end < start) return 'Coming back has to be on or after leaving.'
  if (nightsBetween(start, end) > 365) return 'For a trip longer than a year, create one stage at a time.'
  return null
}
const NEEDS: [string, string, ChecklistItem['kind']][] = [
  ['flights', 'Compare flights for my dates', 'booking'], ['stay', 'Find a place to stay', 'booking'], ['transport', 'Plan local transport', 'task'], ['car', 'Compare rental cars', 'booking'], ['insurance', 'Compare travel insurance and exclusions', 'task'], ['food', 'Find meals and places to eat', 'idea'], ['experiences', 'Explore things to do', 'idea'], ['documents', 'Check travel document requirements', 'doc'], ['packing', 'Plan what to pack', 'pack'],
]
export function NewTrip() {
  const { state, dispatch } = useStore()
  const {info}=useServer()
  const [turns,setTurns]=useState<TripTurn[]>([]),[intakeDraft,setIntakeDraft]=useState<IntakeDraft>({}),[intakeBusy,setIntakeBusy]=useState(false),[intakeReady,setIntakeReady]=useState(false)
  const epoch=useRef(0),pending=useRef(false),chatLog=useRef<HTMLDivElement>(null)
  useEffect(()=>()=>{epoch.current++},[])
  useEffect(()=>{chatLog.current?.scrollTo({top:chatLog.current.scrollHeight,behavior:'smooth'})},[turns.length])
  const [buildPlan,setBuildPlan]=useState(true)
  const [brief, setBrief] = useState(''), [details, setDetails] = useState(false), [destination, setDestination] = useState(''), [country, setCountry] = useState('')
  const [start, setStart] = useState(() => addDays(localToday(), 30)), [end, setEnd] = useState(() => addDays(localToday(), 34))
  const [scope, setScope] = useState<string[]>(['flights', 'stay']), [companions, setCompanions] = useState('solo'), [count, setCount] = useState(1), [budget, setBudget] = useState('')
  const [needs, setNeeds] = useState((state.profile.personalNeeds ?? []).join('; ')), [discounts, setDiscounts] = useState(state.profile.memberships.join('; ')), [error, setError] = useState('')
  const [planning,setPlanning]=useState<TripPlanning>({origin:state.profile.homeBases?.[0]??'',transport:'other',arriveBy:'',homeBy:'',goals:''})
  async function clarify(){
    if(!brief.trim()||pending.current)return
    if(!info.authenticated||info.provider!=='live'){setError('Connect your account in Profile to plan together.');return}
    const current=++epoch.current,message=brief.trim(),last=turns.at(-1),next=last?.from==='you'&&last.text===message?turns:[...turns,{id:uid(),from:'you' as const,text:message,at:new Date().toISOString()}]
    pending.current=true;setIntakeBusy(true);setError('');setTurns(next);setBrief('');setIntakeReady(false)
    try{
      const intakeContext=buildIntakeContext(intakeDraft,next,state.profile,localToday(),Intl.DateTimeFormat().resolvedOptions().timeZone)
      const result=await api<ResearchAnswer>('/api/intelligence',{method:'POST',json:{purpose:'trip-intake',question:intakePrompt,context:intakeContext},signal:AbortSignal.timeout(100000)})
      if(current!==epoch.current)return
      if(result.incomplete)throw Error('The follow-up was cut short. Please send your last answer again.')
      const answer=parseIntake(result.sections.map(s=>s.text).join('\n'),localToday(),intakeDraft),d=answer.draft
      setIntakeDraft(d);setIntakeReady(answer.ready)
      setTurns(old=>[...old,{id:uid(),from:'magic',text:[answer.reply,...answer.questions].join('\n'),at:new Date().toISOString()}])
      if(d.destination!==undefined)setDestination(d.destination)
      if(d.country!==undefined)setCountry(d.country)
      if(d.start)setStart(d.start)
      if(d.end)setEnd(d.end)
      if(d.travelers)setCount(d.travelers)
      if(d.companions!==undefined)setCompanions(d.companions)
      if(d.budget!==undefined)setBudget(String(d.budget))
      setPlanning(old=>({...old,...(d.origin?{origin:d.origin}:{}),...(d.transport?{transport:d.transport}:{}),...(d.goals?{goals:d.goals}:{})}))
      if(d.transport==='drive')setScope(['food','experiences','packing'])
      else if(d.transport==='flight'&&/stay(?:ing)? with family|no hotel/i.test(d.goals??''))setScope(['flights'])
      if(answer.ready)setDetails(true)
    }catch(e){if(current===epoch.current){setError((e as Error).message);setBrief(message)}}finally{if(current===epoch.current){setIntakeBusy(false);pending.current=false}}
  }
  function dayTrip(example=false){
    setDetails(true);setScope(example?['car','food','experiences','packing']:['food','experiences','packing'])
    let day=start
    if(example){day=localToday().slice(0,8)+'25';if(day<localToday()){const next=new Date(day+'T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);day=next.toISOString().slice(0,10)}setDestination('Yosemite National Park');setCountry('United States');setBrief('A day trip from San Francisco: rent a car, arrive by 7–8am, one manageable hike, vegetarian food and time to enjoy the park. Back home in the evening. Explain what fits in 12 hours including driving.');setStart(day)}
    setEnd(day);setPlanning(p=>({...p,origin:example?'San Francisco':p.origin,transport:example?'rental-car':p.transport==='other'?'drive':p.transport,arriveBy:example?'08:00':p.arriveBy,homeBy:example?'20:00':p.homeBy,goals:example?'One manageable hike, vegetarian lunch, quiet time, a realistic return drive. Compare 12 hours total against a longer day.':p.goals}))
  }
  const context = `Dream: ${brief || 'not supplied yet'}. Home bases: ${(state.profile.homeBases ?? [state.profile.homeAirport]).filter(Boolean).join(', ') || 'not supplied'}. I want help only with: ${scope.join(', ') || 'deciding what I need'}.`
  return <div className="screen wizard">
    <TopBar back="/trips" />
    <h1 className="wizard-q">Hey Star.<br />Let’s plan your trip.</h1>
    <p>Start with a place, a date and what you’d enjoy.</p>
    <details className="new-trip-call"><summary>Prefer a phone call?</summary><FoVoice/><p className="small dim">Use the trip chat to save the requirements you agree on during the call.</p></details>
    <section className="trip-intake" aria-label="Plan your trip together"><div ref={chatLog} className="trip-conversation-log" role="log" aria-live="polite">{turns.map(turn=><p key={turn.id} className={turn.from}><strong>{turn.from==='you'?'You':'Magic'}</strong>{turn.text}</p>)}</div><form onSubmit={e=>{e.preventDefault();void clarify()}}><VoiceField label={turns.length?'Your answer':'Tell me about your trip'} value={brief} onChange={setBrief} maxLength={1000} required disabled={intakeBusy} placeholder="Where you want to go, when, and what would make it a good trip…"/><Btn type="submit" disabled={intakeBusy||!brief.trim()}>{intakeBusy?'thinking…':turns.length?'send':'plan with me'}</Btn></form>{intakeReady&&<p role="status">Your requirements are ready. Review the details below, then create your trip and plan your days.</p>}{intakeBusy&&<p role="status">Working out what matters for your trip…</p>}</section>
    <button className="linkbtn" type="button" onClick={()=>setDetails(v=>!v)} aria-expanded={details}>{details?'hide trip details':'edit details myself'}</button>
    <div className="ac-buttons"><Btn kind="ghost" onClick={()=>dayTrip()}>plan a day trip</Btn><button type="button" className="linkbtn small" onClick={()=>dayTrip(true)}>try the SF → Yosemite example</button></div>
    {details&&brief.trim() && <details className="new-trip-ideas"><summary>Compare a few ideas</summary><ResearchPanel title="Think it through" context={context} prompt={`Help me shape this trip: ${brief}. Explain useful options and ask relevant missing questions. No bookings or invented availability.`} /></details>}
    {!details&&error&&<p role="alert">{error}</p>}
    {details && <form onSubmit={(e) => {
      e.preventDefault(); const problem = dateProblem(start, end)
      if (problem) return setError(problem)
      if (!destination.trim()) return setError('Where are you going?')
      const id = uid(), trip: Trip = { planning: {...planning,goals:planning.goals||brief.trim()}, id, destination: destination.trim(), country: country.trim(), start, end, travelers: count, companions, budget: budget ? Number(budget) : 0, vibe: state.profile.style, conversation:turns, constraints: [planning.goals||brief.trim(),...(intakeDraft.arrivalAirport?[`Arrival airport: ${intakeDraft.arrivalAirport}`]:[]), ...needs.split(';').map((v) => v.trim())].filter(Boolean), discounts: discounts.split(';').map((v) => v.trim()).filter(Boolean), status: 'planning', tint: 'blue', summary: {}, options: [], bookings: [], memories: [] }
      const items: ChecklistItem[] = NEEDS.filter(([key]) => scope.includes(key)).map(([, text, kind]) => ({ id: uid(), tripId: id, phase: kind === 'pack' || kind === 'doc' ? 'prepare' : 'plan', text, kind, done: false }))
      dispatch({ type: 'addTrip', trip, items }); go(`/trip/${id}/itinerary${buildPlan?'?plan=auto':''}`)
    }}>
      <h2 className="section-h">Just the things that matter</h2>
      <label className="small planner-replace"><input type="checkbox" checked={buildPlan} onChange={e=>setBuildPlan(e.target.checked)}/> Build my itinerary from these details and my saved preferences</label>

      <label>Destination<input className="chalk-input" required placeholder="Where are we going?" value={destination} maxLength={120} onChange={(e) => setDestination(e.target.value)} /></label>
      <label>Country (optional)<input className="chalk-input" placeholder="Country (optional)" value={country} maxLength={120} onChange={(e) => setCountry(e.target.value)} /></label>
      <div className="date-row"><label>Leave<input type="date" className="chalk-input" required min={localToday()} value={start} onChange={(e) => {if(end===start)setEnd(e.target.value);setStart(e.target.value)}} /></label><label>Return<input type="date" className="chalk-input" required min={start} value={end} onChange={(e) => setEnd(e.target.value)} /></label></div>
      <label>Starting from<input className="chalk-input" maxLength={150} value={planning.origin} onChange={e=>setPlanning(p=>({...p,origin:e.target.value}))} placeholder="San Francisco"/></label>
      <label>Getting there<select className="chalk-input" value={planning.transport} onChange={e=>setPlanning(p=>({...p,transport:e.target.value as TripPlanning['transport']}))}>{[['other','Decide with me'],['rental-car','Rent a car and drive'],['drive','Drive my car'],['flight','Fly'],['rail','Train / public transport']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <div className="date-row"><label>Arrive by (destination time)<input className="chalk-input" type="time" value={planning.arriveBy} onChange={e=>setPlanning(p=>({...p,arriveBy:e.target.value}))}/></label><label>Home / finish by (home time)<input className="chalk-input" type="time" value={planning.homeBy} onChange={e=>setPlanning(p=>({...p,homeBy:e.target.value}))}/></label></div>
      <p>What needs planning?</p><div className="chips wrap">{NEEDS.map(([key]) => <Chip key={key} on={scope.includes(key)} onClick={() => setScope((all) => all.includes(key) ? all.filter((v) => v !== key) : [...all, key])}>{key}</Chip>)}</div>
      <button className="linkbtn" type="button" onClick={() => { setScope(['flights']); setPlanning(p=>({...p,transport:'flight'})); setCompanions('visiting family') }}>Only flights—staying with family</button>
      <label>Who’s coming?<input className="chalk-input" placeholder="Who’s coming?" value={companions} maxLength={150} onChange={(e) => setCompanions(e.target.value)} /></label>
      <label>Travelers<input className="chalk-input" type="number" min={1} max={100} required value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>
      <label>Budget in USD (optional)<input className="chalk-input" type="number" min={0} placeholder="Budget in USD (optional)" value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
      <label>Needs, pets, accessibility, or anything else<input className="chalk-input" placeholder="Needs, pets, accessibility…" value={needs} maxLength={2000} onChange={(e) => setNeeds(e.target.value)} /></label>
      <label>Discount eligibility and memberships (separate with ;)<input className="chalk-input" placeholder="Memberships or discounts…" value={discounts} maxLength={1500} onChange={(e) => setDiscounts(e.target.value)} /></label>
      <p className="small dim">Membership names help research. No loyalty account is connected and no discount is applied until a provider verifies it.</p>
      {error && <p role="alert">{error}</p>}<Btn type="submit" kind="solid" disabled={intakeBusy}>{buildPlan?'create trip & plan my days':'create my trip'}</Btn>
    </form>}
  </div>
}
