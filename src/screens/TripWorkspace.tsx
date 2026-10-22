import {ItineraryPlanner} from '../components/travel/ItineraryPlanner'
import {TripTools} from '../components/travel/TripTools'
import {DeleteTrip} from '../components/travel/DeleteTrip'
import {NextStep} from '../components/travel/NextStep'
import {JournalMoment} from '../components/journal/JournalMoment'
import {useToday} from '../state/today'
import { MomentComposer } from '../components/journal/MomentComposer'
import { printRoute } from '../print/intent'
import { lazy, Suspense, useState } from 'react'
import { useStore } from '../state/store'
import { go, hashQuery, useUI } from '../state/ui'
import { Doodle, Scribble } from '../components/layout/Doodle'
import { AddRow, ChecklistRow } from '../components/travel/Checklist'
import { Btn, Chip, TopBar, daysUntil, fmtRange } from '../components/layout/ui'
import { Notebook } from './Notebook'
import { type Trip, type Memory } from '../types'

const TripMap=lazy(()=>import('../components/discovery/TripMap').then(m=>({default:m.TripMap})))
const TravelArrangements=lazy(()=>import('../components/travel/TravelArrangements').then(m=>({default:m.TravelArrangements})))

export function TripWorkspace({ id, tab = 'plan' }: { id: string; tab?: string }) {
  const { state } = useStore()
  const { focusTripId, setFocusTrip } = useUI()
  const today = useToday()
  const trip = state.trips.find((t) => t.id === id)
  if (!trip) {
    return (
      <div className="screen center">
        <p>That trip wandered off.</p>
        <Btn onClick={() => go('/trips')}>back to trips</Btn>
      </div>
    )
  }
  const inTripMode = focusTripId === trip.id
  const d = daysUntil(trip.start)
  const tabs = [
    { id: 'plan', label: 'Overview' },
    { id: 'itinerary', label: 'Itinerary' },
    { id: 'notebook', label: 'Bookings' },
    { id: 'journal', label: 'Journal' },
  ]

  return (
    <div className={`screen trip trip-${trip.tint}`}>
      {!inTripMode && <><TopBar
        back="/trips"
        right={tab === 'notebook' ? undefined :
          <div className="ac-buttons"><button className="iconbtn" aria-label="Preview and decorate print" title="Preview & decorate" onClick={()=>go(`/trip/${trip.id}/print${tab==='journal'?'/journal':''}?preview=1`)}><Doodle name="pencil" size={24}/></button><button className="iconbtn" onClick={() => go(printRoute(trip.id, tab === 'journal' ? 'journal' : 'card'))} aria-label="Print">
            <Doodle name="printer" size={26} />
          </button></div>
        }
      />
      <header className="trip-hero">
        <h1>{tab === 'plan' ? trip.destination : tabs.find(t => t.id === tab)?.label}</h1>
        <Scribble color={`var(--${trip.tint})`} width={160} />
        {tab !== 'plan' && <p className="trip-sub">{trip.destination}</p>}
        {tab === 'plan' && <><p className="trip-sub">
          {fmtRange(trip.start, trip.end)} · {trip.travelers} {trip.travelers === 1 ? 'traveler' : 'travelers'} {trip.budget > 0 ? ` · $${trip.budget.toLocaleString()}` : ''}
        </p>
        <div className="chips">
          {trip.status !== 'past' && <Chip tint={trip.tint}>{d > 0 ? `in ${d} days` : trip.end < today ? 'finished' : 'happening now'}</Chip>}
          {trip.constraints.filter(c=>c.length<=70).map((c) => (
            <Chip key={c}>{c}</Chip>
          ))}
        </div>
        {trip.constraints.some(c=>c.length>70)&&<details className="trip-idea"><summary>Your trip idea</summary><p>{trip.constraints.filter(c=>c.length>70).join(' · ')}</p></details>}
        </>}
      </header>
      </>}
      {inTripMode && <h1 className="sr-only">{tabs.find(t => t.id === tab)?.label}</h1>}
      {trip.presentation && <p className="sample-note" role="note">Sample trip · illustrative plans and arrangements. No live reservation is implied.</p>}

      {!inTripMode && <><div className="trip-mode-entry"><button className="btn" data-tour="trip-mode" onClick={() => setFocusTrip(trip.id)}>Enter trip mode</button></div>
      <nav className="seg" aria-label="Trip sections">
        {tabs.map(t => <button key={t.id} data-tour={`section-${t.id}`} className={tab === t.id ? 'on' : ''} onClick={() => go(`/trip/${trip.id}/${t.id}`)} aria-current={tab === t.id ? 'page' : undefined}>{t.label}</button>)}
      </nav></>}


      {tab === 'plan' && <><Plan trip={trip} /><TripTools trip={trip}/><div className="trip-tools"><details className="quiet-section"><summary>Manage</summary><Suspense fallback={<p>Loading…</p>}><TravelArrangements trip={trip}/></Suspense><DeleteTrip trip={trip}/></details></div></>}
      {tab === 'itinerary' && <ItineraryPlanner key={trip.id+'-itinerary'} trip={trip}/>}
      {tab === 'notebook' && <Notebook key={trip.id+'-notebook-'+(hashQuery().get('category') ?? 'flight')} trip={trip} />}
      {tab === 'journal' && <Journal key={trip.id+'-journal'} trip={trip} />}


    </div>
  )
}

function Plan({ trip }: { trip: Trip }) {
  const { state } = useStore()
  const { openMagic } = useUI()
  const items = state.items.filter(i => i.tripId === trip.id)
  const pending = items.filter(i => !i.done).sort((a,b) => Number(!!b.priority)-Number(!!a.priority))
  const done = items.filter(i => i.done)
  const checks = (state.decisions ?? []).filter(d => d.tripId === trip.id && d.validation)
  return <div className="plan">
    <Suspense fallback={<p>Opening map…</p>}><TripMap trip={trip}/></Suspense>
    {trip.status !== 'past' && <NextStep trip={trip}/>}
    <section aria-label="Pending tasks" data-tour="pending"><h2 className="section-h">To do <span className="dim small">{pending.length}</span></h2>
      {pending.length ? <ul className="checklist">{pending.map(i => <ChecklistRow key={i.id} item={i}/>)}</ul> : <p className="dim">All caught up.</p>}
      <AddRow tripId={trip.id} phase="prepare"/>
      {!!done.length && <details><summary>Done · {done.length}</summary><ul className="checklist">{done.map(i => <ChecklistRow key={i.id} item={i}/>)}</ul></details>}
    </section>
    <details className="quiet-section" data-tour="trip-help"><summary>Double-check</summary><p>Check arrivals, check-in times and missing confirmations.</p><Btn icon="sparkle" onClick={() => openMagic({tripId:trip.id,assistant:true,prefill:'Review this trip for missing confirmations, arrival timing and check-in issues. Tell me what needs checking. Do not contact anyone or mark anything confirmed without evidence.'})}>Review with Fo</Btn><p className="small dim">Calls and recordings aren’t available here yet.</p>{checks.map(check => <article key={check.topic}><strong>Check-in · {check.validation!.status === 'verified' ? 'Verified' : 'Unconfirmed'}</strong><p>{check.validation!.summary}</p>{check.validation!.evidence.length > 0 && <details><summary>Evidence</summary><ul>{check.validation!.evidence.map((e,i) => <li key={i}>{e}</li>)}</ul></details>}</article>)}</details>
    <div className="take-along-actions"><Btn icon="printer" onClick={() => go(`/trip/${trip.id}/print?preview=1`)}>Preview PDF</Btn></div>
  </div>
}

function Journal({ trip }: { trip: Trip }) {
  const { state, dispatch } = useStore()
  const [removed,setRemoved]=useState<{memory:Memory;index:number}|null>(null)
  return (
    <div className="journal">

      <MomentComposer trip={trip} />
      <div className="trip-photo-timeline">{(state.photoHistory ?? []).filter((p) => p.tripId === trip.id && !!p.image).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)).map((p) => <figure key={p.id}><img src={p.image} alt={p.filename} loading="lazy" /><figcaption>{p.capturedAt.slice(0, 10)} · {p.city}</figcaption></figure>)}</div>
      {trip.memories.length === 0 && <p className="empty">memories you jot down will live here ✎</p>}
      {removed&&<p className="journal-undo" role="status">Moment deleted. <button className="linkbtn" onClick={()=>{dispatch({type:'restoreMemory',tripId:trip.id,...removed});setRemoved(null)}}>undo</button></p>}
      <div className="memories">
        {[...trip.memories].sort((a,b)=>a.day.localeCompare(b.day)).map((memory,i)=><JournalMoment key={memory.id} memory={memory} tripId={trip.id} index={i} onDelete={()=>{setRemoved({memory,index:trip.memories.findIndex(m=>m.id===memory.id)});dispatch({type:'deleteMemory',tripId:trip.id,id:memory.id})}}/>)}
      </div>

      {trip.memories.length > 0 && (
        <Btn kind="solid" icon="book" onClick={() => go(`/trip/${trip.id}/print/journal?preview=1`)}>
          see journal page
        </Btn>
      )}
    </div>
  )
}
