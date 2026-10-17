import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useStore } from '../state/store'
import { go } from '../state/ui'
import { Doodle } from '../components/Doodle'
import { Btn, Chip, TopBar, fmtRange } from '../components/ui'
import type { Trip } from '../types'

export function PrintView({ id, doc }: { id: string; doc?: string }) {
  const { state } = useStore()
  const trip = state.trips.find((t) => t.id === id)
  const [kind, setKind] = useState<'card' | 'journal'>(doc === 'journal' ? 'journal' : 'card')
  if (!trip) return null

  return (
    <div className="screen print-screen">
      <div className="no-print">
        <TopBar back={`/trip/${trip.id}`} title="print" />
        <div className="chips center">
          <Chip on={kind === 'card'} onClick={() => setKind('card')} icon="ticket">
            trip card
          </Chip>
          <Chip on={kind === 'journal'} onClick={() => setKind('journal')} icon="book">
            journal page
          </Chip>
        </div>
      </div>

      <div className="print-stage">{kind === 'card' ? <TripCard trip={trip} /> : <JournalPage trip={trip} />}</div>

      <div className="no-print print-actions">
        <Btn kind="solid" icon="printer" onClick={() => window.print()}>
          print
        </Btn>
        <p className="dim small">Uses your browser's print dialog. Portable printer support comes later.</p>
        <button className="linkbtn" onClick={() => go(`/trip/${trip.id}/journal`)}>
          edit memories
        </button>
      </div>
    </div>
  )
}

function TripCard({ trip }: { trip: Trip }) {
  const { state } = useStore()
  const [qr, setQr] = useState('')
  useEffect(() => {
    const text = [
      `TATADA · ${trip.destination} · ${fmtRange(trip.start, trip.end)}`,
      ...trip.bookings.map((b) => `${b.title} | ${b.when} | ${b.ref}`),
      trip.localAddress ? `Stay: ${trip.localAddress}` : '',
    ]
      .filter(Boolean)
      .join('\n')
    QRCode.toDataURL(text, { margin: 1, width: 240, color: { dark: '#1d1d1b', light: '#ffffff' } }).then(setQr)
  }, [trip])

  return (
    <article className="sheet card-sheet">
      <header>
        <span className="sheet-logo">tatada</span>
        <span className="sheet-sim">sample data</span>
      </header>
      <h1>{trip.destination}</h1>
      <p className="sheet-sub">
        {fmtRange(trip.start, trip.end)} · {trip.travelers} {trip.travelers === 1 ? 'traveler' : 'travelers'} · {state.profile.name}
      </p>
      <div className="sheet-grid">
        <ul className="sheet-bookings">
          {trip.bookings.length === 0 && <li>No bookings yet.</li>}
          {trip.bookings.map((b) => (
            <li key={b.id}>
              <strong>{b.title}</strong>
              <span>{b.when}</span>
              <span>
                ref <code>{b.ref}</code> · {b.detail}
              </span>
            </li>
          ))}
        </ul>
        <div className="sheet-qr">
          {qr && <img src={qr} alt="QR code with trip summary" />}
          <span>scan: trip summary</span>
        </div>
      </div>
      {trip.localAddress && (
        <div className="sheet-address">
          <span>show the driver</span>
          <p>{trip.localAddress}</p>
        </div>
      )}
      <footer>
        <span>
          <Doodle name="heart" size={14} /> have the best time
        </span>
      </footer>
    </article>
  )
}

function JournalPage({ trip }: { trip: Trip }) {
  const photos = trip.memories.filter((m) => m.kind === 'photo').length
  const places = new Set(trip.memories.map((m) => m.place).filter(Boolean)).size
  return (
    <article className="sheet journal-sheet">
      <header>
        <span className="sheet-logo">tatada journal</span>
        <span>{fmtRange(trip.start, trip.end)}</span>
      </header>
      <h1>{trip.destination}</h1>
      <p className="sheet-stats">
        {trip.memories.length} memories · {places} places · {photos} photos
      </p>
      <div className="j-grid">
        {trip.memories.map((m, i) => (
          <figure key={m.id} className={`j-item ${m.kind}`} style={{ transform: `rotate(${((i * 53) % 5) - 2}deg)` }}>
            {m.kind === 'photo' && (
              <div className="j-photo">
                <Doodle name="camera" size={26} />
              </div>
            )}
            <blockquote>{m.text}</blockquote>
            <figcaption>
              {m.day}
              {m.place ? ` · ${m.place}` : ''}
            </figcaption>
          </figure>
        ))}
      </div>
      {trip.memories.length === 0 && <p className="sheet-sub">No memories yet. Jot some down in the Journal tab.</p>}
      <footer>
        <span>made with tatada ✶</span>
      </footer>
    </article>
  )
}
