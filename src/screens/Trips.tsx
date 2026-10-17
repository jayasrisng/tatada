import { useStore } from '../state/store'
import { go } from '../state/ui'
import { Doodle } from '../components/Doodle'
import { Box, Chip, Heading, TopBar, daysUntil, fmtRange } from '../components/ui'

export function Trips() {
  const { state } = useStore()
  const order = { upcoming: 0, planning: 1, past: 2 }
  const trips = [...state.trips].sort((a, b) => order[a.status] - order[b.status] || a.start.localeCompare(b.start))

  return (
    <div className="screen">
      <TopBar back="/" />
      <Heading>Trips</Heading>

      <div className="trip-list">
        {trips.map((t, i) => {
          const items = state.items.filter((x) => x.tripId === t.id)
          const done = items.filter((x) => x.done).length
          const d = daysUntil(t.start)
          return (
            <Box key={t.id} className={`trip-card ${t.status}`} tint={t.tint} onClick={() => go(`/trip/${t.id}`)}>
              <div className="tc-row" style={{ transform: `rotate(${i % 2 ? 0.6 : -0.6}deg)` }}>
                <div>
                  <h2>{t.destination}</h2>
                  <p className="dim">
                    {fmtRange(t.start, t.end)} · {t.companions}
                  </p>
                </div>
                <Chip tint={t.status === 'past' ? 'chalk' : t.tint}>
                  {t.status === 'past' ? 'memories' : d > 0 ? `${d} days` : 'now'}
                </Chip>
              </div>
              <div className="tc-progress">
                <span className="cc-bar">
                  <i style={{ width: `${(done / Math.max(items.length, 1)) * 100}%` }} />
                </span>
                <span className="dim small">
                  {done}/{items.length}
                </span>
              </div>
            </Box>
          )
        })}

        <Box dashed className="trip-card new" onClick={() => go('/new')}>
          <Doodle name="plus" size={30} />
          <span>new trip</span>
        </Box>
      </div>
    </div>
  )
}
