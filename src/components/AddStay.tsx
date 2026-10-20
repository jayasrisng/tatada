import { useState } from 'react'
import type { Trip } from '../types'
import { uid, useStore } from '../state/store'
import { fmtDay, isIsoDate, nightsBetween } from '../magic/dates'
import { isEmail } from '../magic/stay'
import { Btn } from './ui'

/** Lets the traveler record a stay they've booked, so Magic never has to guess it. */
export function AddStay({ trip, onDone }: { trip: Trip; onDone?: () => void }) {
  const { dispatch } = useStore()
  const [v, setV] = useState({ title: '', contact: '', checkIn: trip.start, checkOut: trip.end, ref: '' })
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    if (!v.title.trim()) return setError('Add the name of the place.')
    if (v.contact.trim() && !isEmail(v.contact)) return setError('That email address doesn\'t look right.')
    if (!isIsoDate(v.checkIn) || !isIsoDate(v.checkOut) || v.checkOut <= v.checkIn) return setError('Check-out has to be after check-in.')
    if (v.checkIn < trip.start || v.checkOut > trip.end) return setError('The stay should fit inside the trip dates.')
    const n = nightsBetween(v.checkIn, v.checkOut)
    dispatch({
      type: 'addBooking',
      tripId: trip.id,
      booking: {
        id: uid(),
        kind: 'stay',
        title: v.title.trim(),
        when: `${fmtDay(v.checkIn)} → ${fmtDay(v.checkOut)} · ${n} ${n === 1 ? 'night' : 'nights'}`,
        checkIn: v.checkIn,
        checkOut: v.checkOut,
        contact: v.contact.trim() || undefined,
        ref: v.ref.trim(),
        detail: 'added by you',
        simulated: false,
      },
    })
    onDone?.()
  }

  const field = (key: keyof typeof v, label: string, type = 'text', extra: Record<string, string> = {}) => (
    <label>
      <span>{label}</span>
      <input placeholder={type==='text'?label:undefined} className="chalk-input" type={type} value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} {...extra} />
    </label>
  )

  return (
    <form
      className="details-form"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      {field('title', 'Where are you staying?', 'text', { placeholder: 'hotel or host name' })}
      {field('contact', 'Their email (from your confirmation)', 'email', { placeholder: 'optional' })}
      <div className="date-row">
        {field('checkIn', 'check-in', 'date', { min: trip.start, max: trip.end })}
        {field('checkOut', 'check-out', 'date', { min: trip.start, max: trip.end })}
      </div>
      {field('ref', 'Booking reference', 'text', { placeholder: 'optional' })}
      {error && <p className="ac-problem" role="alert">{error}</p>}
      <Btn kind="solid" type="submit">
        save stay
      </Btn>
    </form>
  )
}
