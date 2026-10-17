import { useState } from 'react'
import { uid, useStore } from '../state/store'
import { Doodle } from '../components/Doodle'
import { Box, Btn, Chip, Heading, Paper, SampleNote, TopBar } from '../components/ui'
import { LISBON_GAPS, LISBON_STYLE } from '../data/seed'
import { daysOf, fmtDay } from '../magic/dates'

const BASICS = ['Comfortable walking shoes', 'An extra layer for evenings', 'Phone charger + plug adapter']

export function Style() {
  const { state, dispatch } = useStore()
  const trips = state.trips.filter((t) => t.status !== 'past').sort((a, b) => a.start.localeCompare(b.start))
  const [tripId, setTripId] = useState(trips[0]?.id)
  const trip = trips.find((t) => t.id === tripId) ?? trips[0]
  const demo = trip?.demoScenario === 'lisbon'
  const have = new Set(state.items.filter((i) => i.tripId === trip?.id).map((i) => i.text.trim().toLowerCase()))
  const stay = trip?.bookings.find((b) => b.kind === 'stay')
  const days = trip ? daysOf(stay?.checkIn ?? trip.start, stay?.checkOut && stay.checkOut <= trip.end ? stay.checkOut : trip.end) : []
  const gaps = demo ? LISBON_GAPS : BASICS

  return (
    <div className="screen style">
      <TopBar back="/" />
      <Heading tint="var(--pink)" sub="outfits for the trip, and someday for every day">
        Style
      </Heading>

      {!trip ? (
        <p className="empty">Plan a trip and its days will show up here.</p>
      ) : (
        <>
          {trips.length > 1 && (
            <div className="chips" role="group" aria-label="Trip">
              {trips.map((t) => (
                <Chip key={t.id} tint={t.tint} on={t.id === trip.id} onClick={() => setTripId(t.id)}>
                  {t.destination}
                </Chip>
              ))}
            </div>
          )}

          <h3 className="section-h">{trip.destination}, day by day</h3>
          <div className="outfits">
            {days.map((iso, i) => {
              const d = demo ? LISBON_STYLE[iso] : undefined
              return (
                <Paper key={iso} className="outfit" tilt={i % 2 ? 1.2 : -1.2}>
                  <div className="outfit-top">
                    <strong>{fmtDay(iso).split(',')[0]}</strong>
                    <span>
                      {d ? <><Doodle name={d.sky} size={18} /> {d.temp}</> : fmtDay(iso).split(', ')[1]}
                    </span>
                  </div>
                  {d ? (
                    <>
                      <ul>
                        {d.look.map((l) => (
                          <li key={l}>{l}</li>
                        ))}
                      </ul>
                      <em>{d.note}</em>
                    </>
                  ) : (
                    <em>no forecast connected yet</em>
                  )}
                </Paper>
              )
            })}
          </div>
          {demo && <SampleNote>sample forecast and outfits (demo data)</SampleNote>}

          <h3 className="section-h">missing from your bag</h3>
          <ul className="gaps">
            {gaps.map((g) => {
              const added = have.has(g.toLowerCase())
              return (
                <li key={g}>
                  <span>{g}</span>
                  <Btn
                    kind="ghost"
                    icon={added ? 'tick' : 'plus'}
                    disabled={added}
                    onClick={() => dispatch({ type: 'addItem', item: { id: uid(), tripId: trip.id, phase: 'prepare', text: g, done: false, kind: 'pack' } })}
                  >
                    {added ? 'on list' : 'add'}
                  </Btn>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <Box dashed className="wardrobe-soon">
        <Doodle name="camera" size={34} />
        <p>snap your wardrobe → outfits from clothes you own</p>
        <span className="dim small">coming soon</span>
      </Box>
    </div>
  )
}
