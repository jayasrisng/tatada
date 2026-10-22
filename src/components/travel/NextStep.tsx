import { useEffect, useState } from 'react'
import type { Trip } from '../../types'
import { nextTravelStep, destinationZone, localStamp } from '../../travel/next'
import { validZone } from '../../travel/confirmations'
import { useStore } from '../../state/store'

export function NextStep({ trip, offline = false }: { trip: Trip; offline?: boolean }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t) }, [])
  const step = nextTravelStep(trip, now), zone = destinationZone(trip)
  return <section className="next-travel-step now-card" aria-label="What comes next"><span className="paper-label">what’s next?</span>
    {zone && validZone(zone) && <p className="small dim">{localStamp(now, zone).replace('T',' · ')} · {zone}</p>}
    {step ? <><h2>{step.title}</h2><p>{step.when.replace('T', ' · ')} {step.zone && `· ${step.zone}`}</p>{step.needsReview && <p className="small dim">{step.needsReview}</p>}{step.reference && <p>Reference: <code>{step.reference}</code></p>}{step.address && <p>{step.address}</p>}
      <div className="ac-buttons">{step.bookingId && !offline && <a className="linkbtn" href={`#/trip/${trip.id}/notebook?booking=${encodeURIComponent(step.bookingId)}`}>open reservation</a>}{step.address && !offline && <a className="linkbtn" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(step.address)}`} target="_blank" rel="noreferrer">directions · online</a>}</div>
    </> : <p>No next step saved. Keep your plans as flexible as you like.</p>}
    <p className="small dim">From saved details · {offline ? 'offline' : 'no live flight status'}</p>
  </section>
}
export function TripTimeZone({ trip }: { trip: Trip }) {
  const { dispatch } = useStore(), [zone, setZone] = useState(trip.timeZone ?? ''), [error, setError] = useState('')
  return <form className="details-form" onSubmit={e => { e.preventDefault(); if (zone && !validZone(zone)) return setError('Use an IANA zone, such as Europe/Paris.'); dispatch({ type: 'setTripTimeZone', tripId: trip.id, zone }); setError('Saved.') }}><label>Destination time zone<input className="chalk-input" aria-label="Destination time zone" placeholder="Europe/Paris" value={zone} maxLength={80} onChange={e => setZone(e.target.value)} /></label><button className="linkbtn" type="submit">save time zone</button>{error && <p role="status">{error}</p>}</form>
}
