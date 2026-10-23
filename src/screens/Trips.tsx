import { lazy, Suspense, useState } from 'react'
import { useStore } from '../state/store'
import { go, useUI } from '../state/ui'
import { SharedTripImport } from '../components/travel/TripSharing'
import { Doodle } from '../components/layout/Doodle'
import { Box, Chip, Heading, TopBar, daysUntil, fmtRange } from '../components/layout/ui'
import { useToday } from '../state/today'
import type { Trip } from '../types'

const TravelHistory = lazy(() => import('../components/journal/TravelHistory').then((m) => ({ default: m.TravelHistory })))

export function Trips({ initial = 'trips' }: { initial?: 'trips' | 'history' }) {
  const today = useToday()
  const [view, setView] = useState<'trips' | 'history'>(initial)
  const { state } = useStore()
  const { focusTripId } = useUI()
  const visibleTrips = state.trips.filter(t => !focusTripId || t.id === focusTripId)
  const byStart = (a: Trip, b: Trip) => a.start.localeCompare(b.start)
  const now = visibleTrips.filter((t) => t.start <= today && t.end >= today).sort(byStart)
  const ahead = visibleTrips.filter((t) => t.start > today && t.status !== 'past').sort(byStart)
  const past = visibleTrips.filter((t) => !(t.id === 'kyoto' && t.bookings.some((b) => b.id === 'kb1' && b.simulated)) && !now.includes(t) && !ahead.includes(t)).sort((a, b) => b.start.localeCompare(a.start))

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
      {location.hash.includes('cleanup=needed')&&<p role="alert">Trip deleted. Some device originals or recovery data could not be cleaned up. Open Profile → Your data to review original confirmations and recovery copies.</p>}
      <div className="trip-sharing-entry" data-tour="import-trip"><span>Have a friend’s trip?</span><SharedTripImport compact/></div>
      {!focusTripId && <nav className="seg" aria-label="Trips views"><button className={view === 'trips' ? 'on' : ''} onClick={() => setView('trips')}>my trips</button><button className={view === 'history' && !focusTripId ? 'on' : ''} onClick={() => setView('history')}>my maps & timeline</button></nav>}
      {view === 'history' && !focusTripId ? <Suspense fallback={<p>Opening your map…</p>}><TravelHistory /></Suspense> : <div className="trip-list">
        <Box dashed className="trip-card new tour-new-trip" onClick={() => go('/new')}>
          <Doodle name="plus" size={30} />
          <span>new trip</span>
        </Box>
        {now.length > 0 && <><h3 className="trip-group">happening now</h3>{now.map(card)}</>}
        {ahead.length > 0 && <><h3 className="trip-group">coming up</h3>{ahead.map(card)}</>}
        {!now.length && !ahead.length && <p className="empty">Where should we go next?</p>}
        {past.length > 0 && <details className="past-trips"><summary>past trips ({past.length})</summary>{past.map(card)}</details>}
      </div>}
    </div>
  )
}
