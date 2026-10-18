import { useStore } from '../state/store'
import { go } from '../state/ui'
import { ThemeToggle } from '../components/ThemeToggle'
import { WorldMap } from '../components/WorldMap'
import { TODAY, daysUntil, fmtRange } from '../components/ui'
import { countryCode } from '../travel/countries'
import { plannedCountries, tripOfTheMoment, visitedCountries } from '../travel/history'

export function Home() {
  const { state } = useStore()
  const moment = tripOfTheMoment(state.trips, TODAY)
  const visited = visitedCountries(state.photoHistory ?? [], state.countryMarks)
  const planned = plannedCountries(state.trips)
  const open = state.items.filter((i) => !i.done).length
  const trip = moment?.trip
  const day = trip && moment.now ? daysUntil(trip.start) * -1 + 1 : 0
  const length = trip ? daysUntil(trip.end) - daysUntil(trip.start) + 1 : 0
  const away = trip && !moment.now ? daysUntil(trip.start) : 0

  return (
    <div className="screen home">
      <header className="home-top">
        <span className="logo">tatada</span>
        <ThemeToggle />
        <button className="avatar" onClick={() => go('/welcome')} aria-label="Your profile">
          {state.profile.name.slice(0, 1) || '?'}
        </button>
      </header>

      <div className="home-now">
        {trip ? (
          <button className="home-trip" onClick={() => go(`/trip/${trip.id}`)}>
            <strong>{moment.now ? `In ${trip.destination}` : trip.destination}</strong>
            <span>{moment.now ? `day ${day} of ${length}` : away === 1 ? 'tomorrow' : `in ${away} days`} · {fmtRange(trip.start, trip.end)}</span>
          </button>
        ) : (
          <button className="home-trip" onClick={() => go('/new')}>
            <strong>Where should we go next?</strong>
            <span>plan a trip</span>
          </button>
        )}
      </div>

      <div className="home-map">
        <WorldMap visited={visited} planned={planned} star={trip ? countryCode(trip.country) : undefined} onSelect={() => go('/trips/map')} label="Your world" />
        <p className="home-legend small dim"><i className="lg visited" /> been <i className="lg planned" /> planned</p>
      </div>

      <nav className="home-links" aria-label="Shortcuts">
        <button onClick={() => go('/tasks')}>{open ? `${open} to do` : 'nothing to do'}</button>
        <button onClick={() => go('/trips')}>trips</button>
        <button onClick={() => go('/style')}>style</button>
      </nav>
    </div>
  )
}
