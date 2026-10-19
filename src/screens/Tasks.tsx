import {ContextPicker} from '../components/ContextPicker'
import { useState } from 'react'
import { useUI } from '../state/ui'
import { useStore } from '../state/store'
import { Doodle } from '../components/Doodle'
import { ActionCard } from '../components/ActionCard'
import { AddRow, ChecklistRow } from '../components/Checklist'
import { Heading, TopBar } from '../components/ui'
import { PHASES } from '../types'

export function Tasks() {
  const { state } = useStore()
  const { focusTripId,openMagic } = useUI()
  const [selectedTrip, setSelectedTrip] = useState<string|undefined>()
  const trips = [...state.trips].sort((a,b) => Number(a.status === 'past') - Number(b.status === 'past') || a.start.localeCompare(b.start))
  const activeTrip = focusTripId ?? (trips.some(t => t.id === selectedTrip) ? selectedTrip : undefined)
  const scope = activeTrip ? 'trip' : 'common'
  const belongs = (tripId?: string) => scope === 'common' ? !tripId : !!activeTrip && tripId === activeTrip
  const [showDone, setShowDone] = useState(false)
  const pastTrips = new Set(state.trips.filter((t) => t.status === 'past').map((t) => t.id))
  const phaseOrder = Object.fromEntries(PHASES.map((p, i) => [p.id, i]))

  const needsYou = state.actions.filter(a => belongs(a.tripId)).filter((a) => a.status === 'proposed' || a.status === 'needs_input')
  const working = state.actions.filter(a => belongs(a.tripId)).filter((a) => a.status === 'running' || a.status === 'done')
  const finished = state.actions.filter(a => belongs(a.tripId)).filter((a) => a.status === 'verified').slice(-3).reverse()
  const open = state.items
    .filter((i) => !i.done && belongs(i.tripId))
    .sort((a, b) => Number(!!b.priority) - Number(!!a.priority) || Number(pastTrips.has(a.tripId ?? '')) - Number(pastTrips.has(b.tripId ?? '')) || phaseOrder[a.phase] - phaseOrder[b.phase])
  const done = state.items.filter((i) => i.done && belongs(i.tripId))

  return (
    <div className="screen tasks">
      <TopBar back="/" />
      <Heading tint="var(--green)">Tasks</Heading>
      <ContextPicker commonLabel="Common" label="Tasks for" trips={trips.filter(t=>t.status!=='past'||t.id===activeTrip)} value={activeTrip} onChange={setSelectedTrip} locked={!!focusTripId}/>
      {scope==='common'&&<button type="button" className="tasks-fo-invite" onClick={()=>openMagic({assistant:true,prefill:open.length?`Help me work through my common tasks:\n${open.slice(0,6).map(i=>`- ${i.text.slice(0,160)}`).join('\n')}`:'Help me decide what I need to get done.'})}><Doodle name="sparkle" size={20}/>Ask Fo. Get shit done.</button>}



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
            <ChecklistRow key={i.id} item={i} />
          ))}
        </ul>
        {!open.length && <p className="small dim">{scope === 'trip' && !activeTrip ? 'Create a trip to add its tasks.' : 'Nothing pending here. A little breathing room.'}</p>}
        {(scope === 'common' || activeTrip) && <AddRow tripId={scope === 'trip' ? activeTrip : undefined} phase="prepare" placeholder="add a task…" />}
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
              <ChecklistRow key={i.id} item={i} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
