import { useState } from 'react'
import { useStore, uid } from '../state/store'
import { go, useUI } from '../state/ui'
import { Doodle, Scribble } from '../components/Doodle'
import { AddRow, ChecklistRow } from '../components/Checklist'
import { Box, Btn, Chip, Paper, SampleNote, TopBar, daysUntil, fmtRange } from '../components/ui'
import { Notebook } from './Notebook'
import { PHASES, type Trip } from '../types'

export function TripWorkspace({ id, tab = 'plan' }: { id: string; tab?: string }) {
  const { state } = useStore()
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
        right={
          <button className="iconbtn" onClick={() => go(`/trip/${trip.id}/print`)} aria-label="Print">
            <Doodle name="printer" size={26} />
          </button>
        }
      />
      <header className="trip-hero">
        <h1>{trip.destination}</h1>
        <Scribble color={`var(--${trip.tint})`} width={160} />
        <p className="trip-sub">
          {fmtRange(trip.start, trip.end)} · {trip.travelers} {trip.travelers === 1 ? 'traveler' : 'travelers'} · ${trip.budget.toLocaleString()}
        </p>
        <div className="chips">
          {trip.status !== 'past' && <Chip tint={trip.tint}>{d > 0 ? `in ${d} days` : 'happening now'}</Chip>}
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

      {tab === 'plan' && <Plan trip={trip} />}
      {tab === 'notebook' && <Notebook trip={trip} />}
      {tab === 'journal' && <Journal trip={trip} />}

    </div>
  )
}

function Plan({ trip }: { trip: Trip }) {
  const { state } = useStore()
  const items = state.items.filter((i) => i.tripId === trip.id)
  return (
    <div className="plan">
      {trip.status !== 'past' && <NowCard trip={trip} />}

      {trip.bookings.length > 0 && (
        <section>
          <h3 className="section-h">booked</h3>
          <div className="tickets">
            {trip.bookings.map((b) => (
              <div key={b.id} className="ticket">
                <Doodle name={b.kind === 'flight' ? 'plane' : b.kind === 'stay' ? 'bed' : b.kind === 'dinner' ? 'fork' : 'tram'} size={22} />
                <div>
                  <strong>{b.title}</strong>
                  <span>{b.when}</span>
                </div>
                <code>{b.ref}</code>
              </div>
            ))}
          </div>
          <SampleNote>confirmation codes are sample data</SampleNote>
        </section>
      )}

      {PHASES.map((p) => {
        const list = items.filter((i) => i.phase === p.id)
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

/* Proactive "right now" card. The time-travel control is a demo affordance. */
function NowCard({ trip }: { trip: Trip }) {
  const { openMagic } = useUI()
  const [m, setM] = useState(0)
  const flight = trip.bookings.find((b) => b.kind === 'flight')
  const stay = trip.bookings.find((b) => b.kind === 'stay')
  const dinner = trip.bookings.find((b) => b.kind === 'dinner')
  const transfer = trip.bookings.find((b) => b.kind === 'transfer')

  const moments = [
    {
      label: 'today',
      title: 'two things left before you go',
      body: <p>Saturday dinner and early check-in aren't sorted yet. Fo can handle both. Tap <em>Fo</em> on either one below.</p>,
    },
    {
      label: 'leaving day',
      title: 'leave for the airport by 1:15pm',
      body: (
        <>
          {flight && (
            <div className="ticket big">
              <Doodle name="plane" size={26} />
              <div>
                <strong>{flight.title}</strong>
                <span>{flight.when} · {flight.detail}</span>
              </div>
              <code>{flight.ref}</code>
            </div>
          )}
          <p className="dim">Passports ✓ · rain shell packed? · plug adapter?</p>
        </>
      ),
    },
    {
      label: 'landing',
      title: `welcome to ${trip.destination.toLowerCase()} ✶`,
      body: (
        <>
          <p>{transfer ? `Your driver is waiting at arrivals (${transfer.detail}).` : 'No transfer booked: take the metro red line, then a 6-minute walk.'}</p>
          {trip.localAddress && (
            <Paper tilt={-1} className="address">
              <span className="paper-label">show the driver</span>
              <p>{stay?.title}<br />{trip.localAddress}</p>
            </Paper>
          )}
        </>
      ),
    },
    {
      label: 'saturday eve',
      title: dinner ? `dinner at ${dinner.when.split('·')[1]?.trim()}` : 'saturday evening is open',
      body: dinner ? (
        <p>{dinner.title}, a 12-minute walk. Sunset at the viewpoint is at 5:21pm, so go early.</p>
      ) : (
        <p>
          Nothing's booked yet.{' '}
          <button className="linkbtn" onClick={() => openMagic({ tripId: trip.id, prefill: 'Book a vegetarian dinner Saturday' })}>
            ask Fo?
          </button>
        </p>
      ),
    },
  ]
  const cur = moments[m]

  return (
    <Box className="now-card" tint="yellow">
      <div className="now-head">
        <span className="now-dot" /> right now
      </div>
      <h2>{cur.title}</h2>
      {cur.body}
      <div className="time-travel">
        <span className="dim small">demo time travel:</span>
        <div className="chips">
          {moments.map((x, i) => (
            <Chip key={x.label} on={i === m} onClick={() => setM(i)}>
              {x.label}
            </Chip>
          ))}
        </div>
      </div>
    </Box>
  )
}

function Journal({ trip }: { trip: Trip }) {
  const { dispatch } = useStore()
  const [text, setText] = useState('')
  return (
    <div className="journal">
      <form
        className="memory-input"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          const tints = ['yellow', 'pink', 'blue', 'green', 'orange'] as const
          dispatch({
            type: 'addMemory',
            tripId: trip.id,
            memory: { id: uid(), day: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), text: text.trim(), kind: 'note', tint: tints[trip.memories.length % 5] },
          })
          setText('')
        }}
      >
        <Doodle name="pencil" size={20} />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="what happened today?" aria-label="Add a memory" />
      </form>

      {trip.memories.length === 0 && <p className="empty">memories you jot down will live here ✎</p>}
      <div className="memories">
        {trip.memories.map((mm, i) => (
          <div key={mm.id} className={`memory ${mm.kind} tint-${mm.tint ?? 'yellow'}`} style={{ transform: `rotate(${((i * 37) % 7) - 3}deg)` }}>
            {mm.kind === 'photo' && (
              <div className="memory-pic">
                <Doodle name="camera" size={30} />
              </div>
            )}
            {mm.kind === 'receipt' && <Doodle name="receipt" size={18} className="memory-kind" />}
            <p>{mm.text}</p>
            <span className="memory-day">
              {mm.day}
              {mm.place ? ` · ${mm.place}` : ''}
            </span>
          </div>
        ))}
      </div>

      {trip.memories.length > 0 && (
        <Btn kind="solid" icon="book" onClick={() => go(`/trip/${trip.id}/print/journal`)}>
          see journal page
        </Btn>
      )}
    </div>
  )
}
