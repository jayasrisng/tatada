import { useState } from 'react'
import type { Claim, Trip, Verdict } from '../types'
import { useStore } from '../state/store'
import { useUI } from '../state/ui'
import { decideEarlyCheckin, decisionFor } from '../magic/decision'
import { isTime } from '../magic/dates'
import { Doodle } from './Doodle'
import { Btn, Chip } from './ui'

const VERDICT: Record<Verdict, { label: string; tint: 'yellow' | 'green' | 'pink' | 'blue' | 'orange' | 'chalk' }> = {
  ask: { label: 'worth asking', tint: 'yellow' },
  need_info: { label: 'need a detail', tint: 'orange' },
  not_needed: { label: 'not needed', tint: 'chalk' },
  dont_ask: { label: 'ruled out', tint: 'pink' },
  awaiting_reply: { label: 'asked · awaiting reply', tint: 'blue' },
  confirmed: { label: 'confirmed', tint: 'green' },
  declined: { label: 'declined', tint: 'pink' },
}
const KIND = { hypothesis: 'hypothesis', fact: 'fact', outcome: 'outcome' } as const

const when = (at?: number) => (at ? new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '')

function ClaimRow({ c }: { c: Claim }) {
  return (
    <li className={`claim ${c.kind} ${c.status}`}>
      <div className="claim-top">
        <span className={`tag kind-${c.kind}`}>{KIND[c.kind]}</span>
        {c.status !== 'open' && c.status !== 'holds' && <span className={`tag st-${c.status}`}>{c.status}</span>}
      </div>
      <p className="claim-text">{c.text}</p>
      <p className="claim-src">
        {c.source.label}
        {c.source.at ? ` · ${when(c.source.at)}` : ''}
      </p>
      {c.uncertainty && <p className="claim-unc">{c.uncertainty}</p>}
      {c.evidence?.map((e) => (
        <p key={e} className="claim-ev">
          <Doodle name="receipt" size={14} /> {e}
        </p>
      ))}
    </li>
  )
}

/** The early check-in decision, reasoned in the open. Lives in the Notebook's Stay tab. */
export function DecisionPanel({ trip }: { trip: Trip }) {
  const { state, dispatch } = useStore()
  const { openMagic } = useUI()
  const rec = decisionFor(state.decisions, trip.id)
  const d = decideEarlyCheckin(trip, rec)
  const [time, setTime] = useState(rec?.inputs.standardCheckIn?.value ?? '')
  const item = state.items.find((i) => i.tripId === trip.id && !i.done && /early check-?in/i.test(i.text))
  const v = VERDICT[d.verdict]
  const canAsk = ['ask', 'need_info'].includes(d.verdict)

  return (
    <section className="decision" aria-labelledby={`dq-${trip.id}`}>
      <div className="decision-head">
        <h3 id={`dq-${trip.id}`}>early check-in?</h3>
        <Chip tint={v.tint}>{v.label}</Chip>
      </div>

      <ol className="dcv">
        <li>
          <h4>
            <span className="step">1</span> diverge · every claim, including the ones that disagree
          </h4>
          <ul className="claims">
            {d.claims.map((c) => (
              <ClaimRow key={c.id} c={c} />
            ))}
          </ul>
        </li>
        <li>
          <h4>
            <span className="step">2</span> collide · where they clash
          </h4>
          {d.collisions.length ? (
            <ul className="collisions">
              {d.collisions.map((x, i) => (
                <li key={i} className={x.disqualifier ? 'dq' : ''}>
                  <Doodle name="bolt" size={15} /> {x.note} {x.disqualifier && <span className="tag st-disqualified">disqualifier</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="dim small">No conflicts.</p>
          )}
        </li>
        <li>
          <h4>
            <span className="step">3</span> converge · what survives
          </h4>
          <p className="converge">{d.rationale}</p>
          {d.missing.includes('standardCheckIn') && (
            <form
              className="decision-input"
              onSubmit={(e) => {
                e.preventDefault()
                if (isTime(time)) dispatch({ type: 'setDecisionInput', tripId: trip.id, key: 'standardCheckIn', value: time, at: Date.now() })
              }}
            >
              <label>
                <span>check-in time on your confirmation</span>
                <input type="time" className="chalk-input" value={time} onChange={(e) => setTime(e.target.value)} />
              </label>
              <Btn kind="ghost" type="submit" disabled={!isTime(time)}>
                save
              </Btn>
            </form>
          )}
          <label className="decision-policy">
            <span>early check-in on your confirmation</span>
            <select
              value={rec?.inputs.policy?.value ?? ''}
              onChange={(e) => dispatch({ type: 'setDecisionInput', tripId: trip.id, key: 'policy', value: e.target.value || undefined, at: Date.now() })}
            >
              <option value="">not mentioned</option>
              <option value="on_request">on request</option>
              <option value="not_offered">not offered</option>
            </select>
          </label>
        </li>
        <li>
          <h4>
            <span className="step">4</span> validate · only the stay can settle it
          </h4>
          {rec?.validation ? (
            <p className="dim small">
              Last checked {when(rec.validation.at)} via {rec.validation.provider === 'live' ? 'live Fo' : 'mock Fo (not real)'}
              {rec.validation.status === 'unverified' ? ': no proof found, so nothing changed.' : '.'}
            </p>
          ) : (
            <p className="dim small">Not asked yet. Fo emails them only after you approve the exact message.</p>
          )}
          {canAsk && (
            <Btn kind="solid" icon="mail" onClick={() => openMagic({ tripId: trip.id, prefill: 'Ask my stay for early check-in', itemId: item?.id, autoSend: true })}>
              ask {stayName(trip)} via Fo
            </Btn>
          )}
          {!canAsk && d.verdict !== 'confirmed' && (
            <button className="linkbtn" onClick={() => openMagic({ tripId: trip.id, prefill: 'Ask my stay for early check-in anyway', itemId: item?.id })}>
              ask anyway
            </button>
          )}
        </li>
      </ol>
    </section>
  )
}

const stayName = (t: Trip) => t.bookings.find((b) => b.kind === 'stay')?.title ?? 'your stay'
