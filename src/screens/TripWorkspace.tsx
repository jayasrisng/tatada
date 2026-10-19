import {TripCalendar} from '../components/TripCalendar'
import {FlightTicket} from '../components/FlightTicket'
import {DeleteTrip} from '../components/DeleteTrip'
import {FlightSearch} from '../components/FlightSearch'
import {OfflineDownload} from '../components/OfflineTrip'
import {NextStep} from '../components/NextStep'
import {JournalMoment} from '../components/JournalMoment'
import {humanWhen} from '../travel/display'
import {useToday} from '../state/today'
import { MomentComposer } from '../components/MomentComposer'
import { printRoute } from '../print/intent'
import { lazy, Suspense, useState } from 'react'
import { useStore } from '../state/store'
import { go, hashQuery, useUI } from '../state/ui'
import { Doodle, Scribble } from '../components/Doodle'
import { AddRow, ChecklistRow } from '../components/Checklist'
import { Box, Btn, Chip, SampleNote, TopBar, daysUntil, fmtRange } from '../components/ui'
import { TripSharing } from '../components/TripSharing'
import { TripResearch } from '../components/TripResearch'
import { Notebook } from './Notebook'
import { AddStay } from '../components/AddStay'
import { PHASES, type Trip, type Memory } from '../types'

const TravelArrangements=lazy(()=>import('../components/TravelArrangements').then(m=>({default:m.TravelArrangements})))

export function TripWorkspace({ id, tab = 'plan' }: { id: string; tab?: string }) {
  const { state } = useStore()
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
  const d = daysUntil(trip.start)
  const tabs = [
    { id: 'plan', label: 'Plan' },
    { id: 'notebook', label: 'Notebook' },
    { id: 'journal', label: 'Journal' },
  ]

  return (
    <div className={`screen trip trip-${trip.tint}`}>
      <TopBar
        back="/trips"
        right={tab === 'notebook' ? undefined :
          <button className="iconbtn" onClick={() => go(printRoute(trip.id, tab === 'journal' ? 'journal' : 'card'))} aria-label="Print">
            <Doodle name="printer" size={26} />
          </button>
        }
      />
      <header className="trip-hero">
        <h1>{trip.destination}</h1>
        <Scribble color={`var(--${trip.tint})`} width={160} />
        <p className="trip-sub">
          {fmtRange(trip.start, trip.end)} · {trip.travelers} {trip.travelers === 1 ? 'traveler' : 'travelers'} {trip.budget > 0 ? ` · $${trip.budget.toLocaleString()}` : ''}
        </p>
        <div className="chips">
          {trip.status !== 'past' && <Chip tint={trip.tint}>{d > 0 ? `in ${d} days` : trip.end < today ? 'finished' : 'happening now'}</Chip>}
          {trip.constraints.map((c) => (
            <Chip key={c}>{c}</Chip>
          ))}
        </div>
      </header>

      <nav className="seg" aria-label="Trip sections">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => go(`/trip/${trip.id}/${t.id}`)} aria-current={tab === t.id ? 'page' : undefined}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'plan' && <><TripResearch trip={trip} /><Plan trip={trip} /><TripSharing trip={trip} /></>}
      {tab === 'notebook' && <Notebook key={hashQuery().get('category') ?? 'flight'} trip={trip} />}
      {tab === 'journal' && <Journal key={trip.id} trip={trip} />}
      <TripCalendar key={trip.id+'-calendar'} trip={trip}/><DeleteTrip key={trip.id} trip={trip}/>

    </div>
  )
}

function Plan({ trip }: { trip: Trip }) {
  const { state } = useStore()
  const bookingTarget=hashQuery().get('booking')
  const [addingStay, setAddingStay] = useState(false)
  const items = state.items.filter((i) => i.tripId === trip.id)
  return (
    <div className="plan"><FlightSearch key={trip.id} trip={trip}/><OfflineDownload trip={trip}/>
      {items.some((i) => i.priority && !i.done) && <section aria-label="Priority tasks"><h3 className="section-h">priority</h3><ul className="checklist">{items.filter((i) => i.priority && !i.done).map((i) => <ChecklistRow key={i.id} item={i} />)}</ul></section>}
      {trip.status !== 'past' && <><NextStep trip={trip}/><NowCard trip={trip}/></>}

      {!trip.bookings.some((b) => b.kind === 'stay') && trip.status !== 'past' && (
        <section>
          {addingStay ? (
            <AddStay trip={trip} onDone={() => setAddingStay(false)} />
          ) : (
            <button className="linkbtn" onClick={() => setAddingStay(true)}>
              + add a stay you've booked
            </button>
          )}
        </section>
      )}

      <details className="manage-arrangements" open={!!bookingTarget}><summary>Add or edit travel details</summary><Suspense fallback={<p>Opening travel details…</p>}><TravelArrangements key={trip.id} trip={trip}/></Suspense></details>
      {trip.bookings.length > 0 && (
        <section>
          <h3 className="section-h">saved arrangements</h3>
          <div className="tickets">
            {trip.bookings.map((b) => (
              b.kind==='flight'?<FlightTicket key={b.id} booking={b} trip={trip} profile={state.profile}/>:<div key={b.id} className="ticket">
                <Doodle name={b.kind === 'stay' ? 'bed' : b.kind === 'dinner' ? 'fork' : 'tram'} size={22} />
                <div>
                  <strong>{b.title}</strong>
                  <span>{humanWhen(b.when)}</span>
                </div>
                {b.ref && <code>{b.ref}</code>}
              </div>
            ))}
          </div>
          {trip.bookings.some((b) => b.simulated) && !trip.presentation && <SampleNote>codes marked from the demo are sample data</SampleNote>}
        </section>
      )}

      {PHASES.map((p) => {
        const list = items.filter((i) => i.phase === p.id && !(i.priority && !i.done)).sort((a, b) => Number(a.done) - Number(b.done))
        const done = list.filter((i) => i.done).length
        return (
          <section key={p.id} className="phase">
            <h3 className="section-h">
              {p.label.toLowerCase()} <span className="dim small">{list.length ? `${done}/${list.length}` : ''}</span>
            </h3>
            <ul className="checklist">
              {list.map((i) => (
                <ChecklistRow key={i.id} item={i} />
              ))}
            </ul>
            <AddRow tripId={trip.id} phase={p.id} />
          </section>
        )
      })}
    </div>
  )
}

/** One clear next action; the full checklist remains below it. */
function NowCard({trip}:{trip:Trip}) {
  const {state}=useStore(), {openMagic}=useUI()
  const open=state.items.filter(i=>i.tripId===trip.id&&!i.done&&(i.phase==='plan'||i.phase==='prepare')).sort((a,b)=>Number(!!b.priority)-Number(!!a.priority))
  const next=open[0]
  return <Box className="now-card" tint="yellow"><span className="paper-label">before you go</span><h2>{next?`${open.length} ${open.length===1?'thing':'things'} left on your checklist`:'Your checklist is clear'}</h2>{next&&<div className="next-action"><p>{next.text}</p><button className="iconbtn" aria-label="Talk to Fo about the next task" onClick={()=>openMagic({tripId:trip.id,assistant:true,itemId:next.id,prefill:next.magicPrompt??`Help me with this trip task: ${next.text}`})}><Doodle name="sparkle" size={22}/></button></div>}</Box>
}

function Journal({ trip }: { trip: Trip }) {
  const { state, dispatch } = useStore()
  const [removed,setRemoved]=useState<{memory:Memory;index:number}|null>(null)
  return (
    <div className="journal">
      <header className="journal-cover"><span className="journal-eyebrow">my travel journal</span><h2>{trip.destination}<span>in my words.</span></h2><p>{fmtRange(trip.start,trip.end)}</p><Doodle name="pencil" size={34}/></header>
      <MomentComposer trip={trip} />
      <div className="trip-photo-timeline">{(state.photoHistory ?? []).filter((p) => p.tripId === trip.id && !!p.image).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)).map((p) => <figure key={p.id}><img src={p.image} alt={p.filename} loading="lazy" /><figcaption>{p.capturedAt.slice(0, 10)} · {p.city}</figcaption></figure>)}</div>
      {trip.memories.length === 0 && <p className="empty">memories you jot down will live here ✎</p>}
      {removed&&<p className="journal-undo" role="status">Moment deleted. <button className="linkbtn" onClick={()=>{dispatch({type:'restoreMemory',tripId:trip.id,...removed});setRemoved(null)}}>undo</button></p>}
      <div className="memories">
        {[...trip.memories].sort((a,b)=>a.day.localeCompare(b.day)).map((memory,i)=><JournalMoment key={memory.id} memory={memory} tripId={trip.id} index={i} onDelete={()=>{setRemoved({memory,index:trip.memories.findIndex(m=>m.id===memory.id)});dispatch({type:'deleteMemory',tripId:trip.id,id:memory.id})}}/>)}
      </div>

      {trip.memories.length > 0 && (
        <Btn kind="solid" icon="book" onClick={() => go(`/trip/${trip.id}/print/journal`)}>
          see journal page
        </Btn>
      )}
    </div>
  )
}
