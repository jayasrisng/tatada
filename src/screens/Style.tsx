import { uid, useStore } from '../state/store'
import { Doodle } from '../components/Doodle'
import { Box, Btn, Heading, Paper, SampleNote, TopBar } from '../components/ui'

const DAYS = [
  { day: 'Sat', temp: '19° / 13°', sky: 'sun', look: ['linen shirt', 'light chinos', 'white sneakers'], note: 'hills all day: comfy shoes' },
  { day: 'Sun', temp: '17° / 12°', sky: 'umbrella', look: ['knit sweater', 'dark jeans', 'rain shell'], note: 'showers after 3pm' },
  { day: 'Mon', temp: '18° / 12°', sky: 'sun', look: ['striped tee', 'overshirt', 'loafers'], note: 'Sintra: layers for the hilltop' },
  { day: 'Tue', temp: '18° / 13°', sky: 'sun', look: ['slip dress or chinos', 'light jacket'], note: 'nice dinner night' },
]

const GAPS = ['Grippy walking shoes', 'Packable rain shell', 'Type F plug adapter']

export function Style() {
  const { state, dispatch } = useStore()
  const have = new Set(state.items.filter((i) => i.tripId === 'lisbon').map((i) => i.text.toLowerCase()))

  return (
    <div className="screen style">
      <TopBar back="/" />
      <Heading tint="var(--pink)" sub="outfits for the trip, and someday for every day">
        Style
      </Heading>

      <h3 className="section-h">Lisbon, day by day</h3>
      <div className="outfits">
        {DAYS.map((d, i) => (
          <Paper key={d.day} className="outfit" tilt={i % 2 ? 1.2 : -1.2}>
            <div className="outfit-top">
              <strong>{d.day}</strong>
              <span>
                <Doodle name={d.sky} size={18} /> {d.temp}
              </span>
            </div>
            <ul>
              {d.look.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <em>{d.note}</em>
          </Paper>
        ))}
      </div>
      <SampleNote>sample forecast</SampleNote>

      <h3 className="section-h">missing from your bag</h3>
      <ul className="gaps">
        {GAPS.map((g) => {
          const added = have.has(g.toLowerCase())
          return (
            <li key={g}>
              <span>{g}</span>
              <Btn
                kind="ghost"
                icon={added ? 'tick' : 'plus'}
                disabled={added}
                onClick={() => dispatch({ type: 'addItem', item: { id: uid(), tripId: 'lisbon', phase: 'prepare', text: g, done: false, kind: 'pack' } })}
              >
                {added ? 'on list' : 'add'}
              </Btn>
            </li>
          )
        })}
      </ul>

      <Box dashed className="wardrobe-soon">
        <Doodle name="camera" size={34} />
        <p>snap your wardrobe → outfits from clothes you own</p>
        <span className="dim small">coming soon</span>
      </Box>
    </div>
  )
}
