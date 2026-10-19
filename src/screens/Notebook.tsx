import {humanWhen} from '../travel/display'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { FlightTicket } from '../components/FlightTicket'
import { useState } from 'react'
import type { Category, ResearchOption, Trip } from '../types'
import { useStore } from '../state/store'
import { go, hashQuery, useUI } from '../state/ui'
import { AddStay } from '../components/AddStay'
import { DecisionPanel } from '../components/DecisionPanel'
import { AddRow } from '../components/Checklist'
import { Doodle } from '../components/Doodle'
import { Btn, Chip, Paper, SampleNote } from '../components/ui'

const TravelArrangements=lazy(()=>import('../components/TravelArrangements').then(m=>({default:m.TravelArrangements})))

const PrintView = lazy(() => import('./PrintView').then(m => ({default:m.PrintView})))

const CATS: { id: Category; label: string; icon: string }[] = [
  { id: 'flight', label: 'Flights', icon: 'plane' },
  { id: 'stay', label: 'Stay', icon: 'bed' },
  { id: 'move', label: 'Getting around', icon: 'tram' },
  { id: 'eat', label: 'Eat', icon: 'fork' },
]

export function Notebook({ trip }: { trip: Trip }) {
  const {state} = useStore()
  const [printOpen,setPrintOpen] = useState<'flights'|'hotels'|null>(null)
  const [cat, setCat] = useState<Category>(() => CATS.find(c => c.id === hashQuery().get('category'))?.id ?? 'flight')
  const [compare, setCompare] = useState(false)
  const [showResearch,setShowResearch] = useState(false)
  const opts = trip.options.filter((o) => o.category === cat)
  const live = opts.filter((o) => o.status !== 'rejected')
  const rejected = opts.filter((o) => o.status === 'rejected')
  const summary = trip.summary[cat]
  const records=trip.bookings.filter(b=>b.kind===(cat==='flight'?'flight':cat==='stay'?'stay':cat==='move'?'transfer':'dinner'))

  return (
    <div className="notebook">
      {printOpen && <NotebookPrintDialog id={trip.id} kind={printOpen} onClose={()=>setPrintOpen(null)}/>}
      <div className="cat-row" role="tablist">
        {CATS.map((c) => (
          <button key={c.id} role="tab" aria-selected={cat === c.id} className={`cat ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>
            <Doodle name={c.icon} size={24} />
            <span>{c.label}</span>
          </button>
        ))}
      </div>

      {(cat === 'flight' || cat === 'stay') && <Btn kind="ghost" icon="printer" onClick={() => setPrintOpen(cat === 'flight' ? 'flights' : 'hotels')}>print {cat === 'flight' ? 'flights' : 'stay'}</Btn>}

      <details key={cat} className="manage-arrangements"><summary>Add or edit {cat==='flight'?'flights':cat==='stay'?'your stay':cat==='move'?'transport':'meals'}</summary><Suspense fallback={<p>Opening travel details…</p>}><TravelArrangements key={`${trip.id}:${cat}`} trip={trip} kind={cat==='flight'?'flight':cat==='stay'?'stay':cat==='move'?'transfer':'dinner'}/></Suspense></details>

      {cat === 'stay' && trip.status !== 'past' && trip.bookings.some((b) => b.kind === 'stay') && <DecisionPanel trip={trip} />}

      {cat === 'flight' && trip.bookings.some(b => b.kind === 'flight') && <div className="flight-keepsakes">{trip.bookings.filter(b => b.kind === 'flight').map(booking => <FlightTicket key={booking.id} booking={booking} trip={trip} profile={state.profile}/>)}</div>}

      {cat!=='flight'&&records.length>0&&<section className="saved-arrangement-list" aria-label="Saved arrangements">{records.map(b=><article className="journey-record" key={b.id}><div><strong>{b.title}</strong><p>{humanWhen(b.when)}</p>{b.detail&&<p>{b.detail}</p>}{b.address&&<p>{b.address}</p>}{b.ref&&<code>{b.ref}</code>}</div></article>)}</section>}
      {records.length>0&&opts.length>0&&<button className="linkbtn small" onClick={()=>setShowResearch(v=>!v)}>{showResearch?'hide':'show'} research options</button>}
      {summary && !records.length && cat !== 'flight' && (
        <Paper className="take" tilt={-0.8}>
          <span className="paper-label">{trip.status === 'past' ? 'what worked' : "tatada's take"}</span>
          <p>{summary}</p>
        </Paper>
      )}

      {records.length>0&&!showResearch ? null : opts.length === 0 ? (
        <NextSteps trip={trip} cat={cat} />
      ) : (
        <>
          <div className="nb-toolbar">
            <span className="dim small">
              {trip.status === 'past' ? `${live.length} ${live.length === 1 ? 'record' : 'records'}` : `${live.length} in the running · ${rejected.length} ruled out`}
            </span>
            {live.length > 1 && (
              <Chip on={compare} onClick={() => setCompare(!compare)} icon="eye">
                compare
              </Chip>
            )}
          </div>

          {compare ? <Compare options={live} /> : live.map((o) => <OptionCard key={o.id} o={o} tripId={trip.id} completed={trip.status === 'past'} />)}

          {rejected.length > 0 && (
            <section className="rejected">
              <h3 className="section-h">
                ruled out <span className="dim small">& why</span>
              </h3>
              {rejected.map((o) => (
                <div key={o.id} className="rej">
                  <div className="rej-top">
                    <s>{o.title}</s>
                    <span className="dim small">{o.price}</span>
                  </div>
                  <p className="rej-why">
                    <Doodle name="x" size={14} stroke={2.6} /> {o.reason}
                  </p>
                </div>
              ))}
            </section>
          )}
        </>
      )}
      {opts.length > 0 && !trip.presentation && <SampleNote>sample research · prices & ratings are illustrative, not live</SampleNote>}
    </div>
  )
}

function OptionCard({ o, tripId, completed = false }: { o: ResearchOption; tripId: string; completed?: boolean }) {
  const { dispatch } = useStore()
  const [src, setSrc] = useState<string | null>(null)
  return (
    <article className={`option ${o.status}`}>
      {o.status === 'chosen' && (
        <span className="option-badge">
          <Doodle name="star" size={16} stroke={2.4} /> {completed ? 'completed' : 'pick'}
        </span>
      )}
      <div className="option-top">
        <div>
          <h3>{o.title}</h3>
          <p className="dim">{o.subtitle}</p>
        </div>
        <span className="price">{o.price}</span>
      </div>
      {o.reason && o.status === 'chosen' && <p className="option-why">{o.reason}</p>}
      <div className="pros-cons">
        <ul className="pros">
          {o.highlights.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
        <ul className="cons">
          {o.tradeoffs.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </div>
      <div className="option-foot">
        <div className="sources">
          {o.sources.map((s) => (
            <button key={s.label} className="source" onClick={() => setSrc(src === s.label ? null : s.label)}>
              <Doodle name="book" size={13} stroke={2.4} /> {s.label}
            </button>
          ))}
        </div>
        {o.status !== 'chosen' && (
          <Btn kind="ghost" icon="star" onClick={() => dispatch({ type: 'choose', tripId, optionId: o.id })}>
            pick
          </Btn>
        )}
      </div>
      {src && <p className="source-pop">"{src}" is a sample source. Live citations come with the research agent.</p>}
    </article>
  )
}

function Compare({ options }: { options: ResearchOption[] }) {
  const keys = Object.keys(options[0]?.metrics ?? {})
  const cols = { gridTemplateColumns: `76px repeat(${options.length}, minmax(0, 1fr))` }
  return (
    <div className="compare" role="table">
      <div className="compare-row head" role="row" style={cols}>
        <span role="columnheader" />
        {options.map((o) => (
          <span key={o.id} role="columnheader" className={o.status === 'chosen' ? 'chosen' : ''}>
            {o.status === 'chosen' && '★ '}
            {o.title}
          </span>
        ))}
      </div>
      {keys.map((k) => (
        <div key={k} className="compare-row" role="row" style={cols}>
          <span role="rowheader" className="dim">
            {k}
          </span>
          {options.map((o) => (
            <span key={o.id} role="cell">
              {o.metrics[k]}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

/* No live research yet, so say so and offer real next steps instead of made-up options. */
function NextSteps({ trip, cat }: { trip: Trip; cat: Category }) {
  const { openMagic } = useUI()
  const hasStay = trip.bookings.some((b) => b.kind === 'stay')
  return (
    <div className="next-steps">
      <p className="dim">Live research isn't connected yet, so this page stays empty instead of showing made-up options.</p>
      {cat === 'stay' &&
        (hasStay ? (
          <p>
            Your stay is saved.{' '}
            <button className="linkbtn" onClick={() => openMagic({ tripId: trip.id, prefill: 'Ask my stay for early check-in' })}>
              ask about early check-in
            </button>
          </p>
        ) : (
          <>
            <h3 className="section-h">already booked somewhere?</h3>
            <AddStay trip={trip} />
          </>
        ))}
      {cat === 'flight' && (
        <p>
          Note flight ideas in your{' '}
          <button className="linkbtn" onClick={() => go(`/trip/${trip.id}/plan`)}>
            plan checklist
          </button>
          , or add one here:
        </p>
      )}
      {cat !== 'stay' && <AddRow tripId={trip.id} phase={cat === 'flight' ? 'plan' : 'discover'} placeholder={cat === 'eat' ? 'a place you want to try…' : cat === 'move' ? 'how you might get around…' : 'a flight to look at…'} />}
    </div>
  )
}

function NotebookPrintDialog({id,kind,onClose}:{id:string;kind:'flights'|'hotels';onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null)
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>{dialog?.close()}},[])
  return <dialog ref={ref} className="notebook-print-panel" aria-label="Print from notebook" onCancel={onClose}>
    <button className="iconbtn" aria-label="Close print panel" autoFocus onClick={onClose}><Doodle name="x" size={22}/></button>
    <Suspense fallback={<p>Opening your print…</p>}><PrintView key={kind} id={id} doc={kind} inline/></Suspense>
  </dialog>
}
