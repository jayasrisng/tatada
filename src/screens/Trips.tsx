import { lazy, Suspense, useState } from 'react'
import { useStore } from '../state/store'
import { go } from '../state/ui'
import { Doodle } from '../components/Doodle'
import { Box, Chip, Heading, TODAY, TopBar, daysUntil, fmtRange } from '../components/ui'
import type { Trip } from '../types'

const TravelHistory = lazy(() => import('../components/TravelHistory').then((m) => ({ default: m.TravelHistory })))

export function Trips({ initial = 'trips' }: { initial?: 'trips' | 'history' }) {
  const [view, setView] = useState<'trips' | 'history'>(initial)
  const { state } = useStore()
  const byStart = (a: Trip, b: Trip) => a.start.localeCompare(b.start)
  const now = state.trips.filter((t) => t.start <= TODAY && t.end >= TODAY).sort(byStart)
  const ahead = state.trips.filter((t) => t.start > TODAY && t.status !== 'past').sort(byStart)
  const past = state.trips.filter((t) => !now.includes(t) && !ahead.includes(t)).sort((a, b) => b.start.localeCompare(a.start))

  const card = (t: Trip, i: number) => {
    const items = state.items.filter((x) => x.tripId === t.id)
    const done = items.filter((x) => x.done).length
    const d = daysUntil(t.start)
    const isNow = now.includes(t)
    return (
      <Box key={t.id} className={`trip-card ${isNow ? 'now' : t.status}`} tint={t.tint} onClick={() => go(`/trip/${t.id}`)}>
        <div className="tc-row" style={{ transform: `rotate(${i % 2 ? 0.6 : -0.6}deg)` }}>
          <div>
            <h2>{t.destination}</h2>
            <p className="dim">{fmtRange(t.start, t.end)}{t.companions ? ` · ${t.companions}` : ''}</p>
          </div>
          <Chip tint={isNow || d > 0 ? t.tint : 'chalk'}>{isNow ? 'now' : d > 0 ? (d === 1 ? 'tomorrow' : `${d} days`) : 'memories'}</Chip>
        </div>
        {items.length > 0 && <div className="tc-progress">
          <span className="cc-bar"><i style={{ width: `${(done / items.length) * 100}%` }} /></span>
          <span className="dim small">{done}/{items.length}</span>
        </div>}
      </Box>
    )
  }

  return (
    <div className="screen">
      <TopBar back="/" />
      <Heading>Trips</Heading>
      <nav className="seg" aria-label="Trips views"><button className={view === 'trips' ? 'on' : ''} onClick={() => setView('trips')}>my trips</button><button className={view === 'history' ? 'on' : ''} onClick={() => setView('history')}>my maps & timeline</button></nav>
      {view === 'history' ? <Suspense fallback={<p>Opening your map…</p>}><TravelHistory /></Suspense> : <div className="trip-list">
        {now.length > 0 && <><h3 className="trip-group">happening now</h3>{now.map(card)}</>}
        {ahead.length > 0 && <><h3 className="trip-group">coming up</h3>{ahead.map(card)}</>}
        {!now.length && !ahead.length && <p className="empty">Where should we go next?</p>}
        <Box dashed className="trip-card new" onClick={() => go('/new')}>
          <Doodle name="plus" size={30} />
          <span>new trip</span>
        </Box>
        {past.length > 0 && <details className="past-trips"><summary>past trips ({past.length})</summary>{past.map(card)}</details>}
      </div>}
    </div>
  )
}
