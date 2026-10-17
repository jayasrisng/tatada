import { useState } from 'react'
import type { Category, ResearchOption, Trip } from '../types'
import { useStore } from '../state/store'
import { useUI } from '../state/ui'
import { Doodle } from '../components/Doodle'
import { Btn, Chip, Paper, SampleNote } from '../components/ui'

const CATS: { id: Category; label: string; icon: string }[] = [
  { id: 'flight', label: 'Flights', icon: 'plane' },
  { id: 'stay', label: 'Stay', icon: 'bed' },
  { id: 'move', label: 'Getting around', icon: 'tram' },
  { id: 'eat', label: 'Eat', icon: 'fork' },
]

export function Notebook({ trip }: { trip: Trip }) {
  const [cat, setCat] = useState<Category>('flight')
  const [compare, setCompare] = useState(false)
  const { openMagic } = useUI()
  const opts = trip.options.filter((o) => o.category === cat)
  const live = opts.filter((o) => o.status !== 'rejected')
  const rejected = opts.filter((o) => o.status === 'rejected')
  const summary = trip.summary[cat]

  return (
    <div className="notebook">
      <div className="cat-row" role="tablist">
        {CATS.map((c) => (
          <button key={c.id} role="tab" aria-selected={cat === c.id} className={`cat ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>
            <Doodle name={c.icon} size={24} />
            <span>{c.label}</span>
          </button>
        ))}
      </div>

      {summary && (
        <Paper className="take" tilt={-0.8}>
          <span className="paper-label">tatada's take</span>
          <p>{summary}</p>
        </Paper>
      )}

      {opts.length === 0 ? (
        <div className="empty">
          <p>Nothing here yet.</p>
          <Btn icon="search" onClick={() => openMagic({ tripId: trip.id, prefill: `Research ${CATS.find((c) => c.id === cat)?.label.toLowerCase()} options for ${trip.destination}` })}>
            research this
          </Btn>
        </div>
      ) : (
        <>
          <div className="nb-toolbar">
            <span className="dim small">
              {live.length} in the running · {rejected.length} ruled out
            </span>
            {live.length > 1 && (
              <Chip on={compare} onClick={() => setCompare(!compare)} icon="eye">
                compare
              </Chip>
            )}
          </div>

          {compare ? <Compare options={live} /> : live.map((o) => <OptionCard key={o.id} o={o} tripId={trip.id} />)}

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
      <SampleNote>sample research · prices & ratings are illustrative, not live</SampleNote>
    </div>
  )
}

function OptionCard({ o, tripId }: { o: ResearchOption; tripId: string }) {
  const { dispatch } = useStore()
  const [src, setSrc] = useState<string | null>(null)
  return (
    <article className={`option ${o.status}`}>
      {o.status === 'chosen' && (
        <span className="option-badge">
          <Doodle name="star" size={16} stroke={2.4} /> pick
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
