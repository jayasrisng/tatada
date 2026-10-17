import { useState } from 'react'
import { useStore } from '../state/store'
import { ActionCard } from '../components/ActionCard'
import { AddRow, ChecklistRow } from '../components/Checklist'
import { Heading, TopBar } from '../components/ui'
import { PHASES } from '../types'

export function Tasks() {
  const { state } = useStore()
  const [showDone, setShowDone] = useState(false)
  const tripName = (id?: string) => state.trips.find((t) => t.id === id)?.destination ?? 'anytime'
  const pastTrips = new Set(state.trips.filter((t) => t.status === 'past').map((t) => t.id))
  const phaseOrder = Object.fromEntries(PHASES.map((p, i) => [p.id, i]))

  const needsYou = state.actions.filter((a) => a.status === 'proposed' || a.status === 'needs_input')
  const working = state.actions.filter((a) => a.status === 'running' || a.status === 'done')
  const finished = state.actions.filter((a) => a.status === 'verified').slice(-3).reverse()
  const open = state.items
    .filter((i) => !i.done)
    .sort((a, b) => Number(pastTrips.has(a.tripId ?? '')) - Number(pastTrips.has(b.tripId ?? '')) || phaseOrder[a.phase] - phaseOrder[b.phase])
  const done = state.items.filter((i) => i.done)

  return (
    <div className="screen tasks">
      <TopBar back="/" />
      <Heading tint="var(--green)">Tasks</Heading>

      {needsYou.length > 0 && (
        <section>
          <h3 className="section-h hot">needs you</h3>
          {needsYou.map((a) => (
            <ActionCard key={a.id} action={a} />
          ))}
        </section>
      )}

      {working.length > 0 && (
        <section>
          <h3 className="section-h">Fo is on it</h3>
          {working.map((a) => (
            <ActionCard key={a.id} action={a} />
          ))}
        </section>
      )}

      <section>
        <h3 className="section-h">up next</h3>
        <ul className="checklist">
          {open.map((i) => (
            <ChecklistRow key={i.id} item={i} showTrip={tripName(i.tripId)} />
          ))}
        </ul>
        <AddRow phase="prepare" placeholder="add a task…" />
      </section>

      {finished.length > 0 && (
        <section>
          <h3 className="section-h">Fo finished</h3>
          {finished.map((a) => (
            <ActionCard key={a.id} action={a} compact />
          ))}
        </section>
      )}

      <section>
        <button className="linkbtn" onClick={() => setShowDone(!showDone)}>
          {showDone ? 'hide' : 'show'} {done.length} done
        </button>
        {showDone && (
          <ul className="checklist">
            {done.map((i) => (
              <ChecklistRow key={i.id} item={i} showTrip={tripName(i.tripId)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
