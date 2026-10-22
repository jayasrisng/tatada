import {destinationZone,localStamp} from '../travel/next'
import {validZone} from '../travel/confirmations'
import {Doodle} from '../components/layout/Doodle'
import { useState } from 'react'
import { useToday } from '../state/today'
import { useStore } from '../state/store'
import { go, useUI } from '../state/ui'
import { ThemeToggle } from '../components/layout/ThemeToggle'
import { AreaMap } from '../components/discovery/AreaMap'
import { WorldMap } from '../components/discovery/WorldMap'
import { TripJourney } from '../components/travel/TripJourney'
import { daysUntil, fmtRange } from '../components/layout/ui'
import { plannedCountries, tripOfTheMoment, visitedCountries } from '../travel/history'
import { countryCode } from '../travel/countries'
import { countryCaption } from '../travel/captions'

const LINES = ['Less planning. More being there.']
export function Home() {
  const { state } = useStore(), { focusTripId, setFocusTrip } = useUI()
  const today = useToday()
  const [line] = useState(() => LINES[Math.floor(Math.random() * LINES.length)])
  const [picked, setPicked] = useState('')
  const tripToday=(t:typeof state.trips[number])=>{const zone=destinationZone(t);return zone&&validZone(zone)?localStamp(new Date(),zone).slice(0,10):today}
  const active=(t:typeof state.trips[number])=>t.start<=tripToday(t)&&t.end>=tripToday(t)
  const eligible = state.trips.filter(t => t.status !== 'past'&&t.end>=tripToday(t)).sort((a,b) => Number(active(b))-Number(active(a))||a.start.localeCompare(b.start))
  const focused = state.trips.find(t => t.id === focusTripId)
  const moment = tripOfTheMoment(focused ? [focused] : state.trips, today)
  const visited = visitedCountries(state.photoHistory ?? [], state.countryMarks)
  const planned = plannedCountries(focused ? [focused] : state.trips)
  const trip = focused ?? moment?.trip
  const now = !!trip && trip.start <= today && trip.end >= today
  const day = trip && now ? daysUntil(trip.start) * -1 + 1 : 0
  const length = trip ? daysUntil(trip.end) - daysUntil(trip.start) + 1 : 0
  const away = trip && !now ? daysUntil(trip.start) : 0
  const selected = eligible.find(t => t.id === picked) ?? eligible[0]

  return <div className={`screen home ${focused ? 'trip-mode' : ''}`}>
    <header className="home-top"><span className="logo">tatada</span><ThemeToggle /><button data-tour="profile" className="avatar" onClick={() => go('/welcome')} aria-label="Your profile">{state.profile.name.slice(0,1) || '?'}</button></header>
    <p className="home-greeting star-arrival">Hey <strong>{state.profile.name || 'Star'}</strong> ✶</p>
    <h1 className="home-invitation">{focused ? `${focused.destination}. Your next chapter.` : line}</h1>

    {focused ? <div className="trip-mode-controls"><p className="small dim">Trip mode · just {focused.destination}</p></div> : eligible.length > 0 && <div className="trip-mode-controls trip-launcher home-trip" role="group" aria-label="Next adventure"><Doodle name="suitcase" size={28}/><div className="trip-launch-copy"><label>Next adventure<span className="trip-launch-choice"><select aria-label="Trip mode destination" value={selected?.id ?? ''} onChange={e=>setPicked(e.target.value)}>{eligible.map(t=><option key={t.id} value={t.id}>{t.destination}</option>)}</select></span></label>{selected&&<span>{active(selected)?`day ${daysUntil(selected.start)*-1+1} of ${daysUntil(selected.end)-daysUntil(selected.start)+1}`:daysUntil(selected.start)===1?'tomorrow':`in ${daysUntil(selected.start)} days`} · {fmtRange(selected.start,selected.end)}</span>}</div><button type="button" className="iconbtn trip-launch-enter" aria-label="Enter trip mode" title="Enter trip mode" onClick={()=>{if(selected){setFocusTrip(selected.id);go(`/trip/${selected.id}/itinerary`)}}}><Doodle name="plane" size={27}/><span>trip mode</span></button></div>}
    {(focused||!selected)&&<div className="home-now">{trip ? <button className="home-trip" onClick={() => go(`/trip/${trip.id}`)}><strong>{now ? `In ${trip.destination}` : trip.destination}</strong><span>{now ? `day ${day} of ${length}` : away === 1 ? 'tomorrow' : away > 0 ? `in ${away} days` : 'your trip'} · {fmtRange(trip.start,trip.end)}</span></button> : <button className="home-trip" onClick={() => go('/new')}><strong>Where should we go next?</strong><span>plan a trip</span></button>}</div>}
    {focused && <TripJourney trip={focused}/>}
    <div className="home-map">{!focused&&<p className="home-legend small dim"><i className="lg visited"/> been <i className="lg planned"/> planned</p>}{focused?.destinationPoint ? <AreaMap trip={focused} /> : <WorldMap visited={focused ? new Set() : visited} planned={planned} label={focused ? `${focused.destination} trip map` : 'Your world'} focus={focused ? {country: countryCode(focused.country), label: focused.destination} : undefined} />}
      {focused ? <p className="trip-mode-line" role="status">{countryCaption(countryCode(focused.country),focused.country)}</p> : <><p className="home-footer"><button className="linkbtn" onClick={() => go('/trips/map')}>your travel story</button> · less scrolling, more living</p></>}
    </div>

  </div>
}
