import type { Trip } from '../../types'
import { tripReadiness } from '../../travel/readiness'
import { useStore } from '../../state/store'
import { Doodle } from '../layout/Doodle'
import { go, useUI } from '../../state/ui'

export function TripReadiness({ trip }: { trip: Trip }) {
  const { state } = useStore()
  const { openMagic } = useUI()
  const readiness = tripReadiness(trip, state.items)
  return <section className="now-card trip-readiness" aria-label="Trip preparation">
    <span className="paper-label">Next up</span>
    <p><button className="linkbtn" onClick={() => go(`/trip/${trip.id}/${readiness.next.section}`)}>{readiness.next.text}</button> <button className="iconbtn" aria-label="Ask Fo about the next step" onClick={() => openMagic({tripId:trip.id,assistant:true,prefill:`Help me prepare for this trip: ${readiness.next.text}. Suggest one useful addition I can review before saving.`})}><Doodle name="sparkle" size={22}/></button></p>
    <p className="small">{readiness.open} open tasks · {readiness.completed} done · {readiness.stops} saved stops · {readiness.savedBookings} saved arrangements</p>
    {readiness.sampleBookings > 0 && <p className="small">{readiness.sampleBookings} sample arrangements are illustrative, not live reservations.</p>}

  </section>
}
