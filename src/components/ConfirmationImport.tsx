import { useRef, useState } from 'react'
import type { Trip } from '../types'
import { useStore, uid } from '../state/store'
import { extractConfirmation, confirmationHash, duplicateBooking, type ConfirmationReview } from '../travel/confirmations'
import { savedArrangement, type ArrangementDraft } from '../travel/arrangements'
import { saveOriginal, deleteOriginal, type Original } from '../travel/originals'
import { Btn } from './ui'

export function ConfirmationImport({ trip }: { trip: Trip }) {
  const { dispatch, workspace } = useStore(), input = useRef<HTMLInputElement>(null), saving = useRef(false)
  const [text, setText] = useState(''), [review, setReview] = useState<ConfirmationReview | null>(null), [source, setSource] = useState<Original | null>(null)
  const [hash, setHash] = useState(''), [retain, setRetain] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const parse = async (value: string, original: Original) => {
    setReview(null); setMessage('')
    const result = extractConfirmation(value), fingerprint = await confirmationHash(original.bytes)
    if (duplicateBooking(trip.bookings, result.draft, fingerprint)) throw new Error('This confirmation is already saved to this trip.')
    setReview(result); setSource(original); setHash(fingerprint)
  }
  const pick = async (f?: File) => {
    if (!f) return
    setBusy(true); setReview(null); setMessage('')
    try {
      if (f.size > 8 * 1024 * 1024 || !f.name.toLowerCase().endsWith('.pdf')) throw new Error('Choose a confirmation PDF up to 8 MB.')
      const bytes = new Uint8Array(await f.arrayBuffer())
      if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new Error('This file is not a PDF.')
      const { confirmationPdf } = await import('../travel/confirmationPdf')
      await parse(await confirmationPdf(bytes), { id: uid(), name: f.name, mime: 'application/pdf', bytes, addedAt: new Date().toISOString() })
    } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) }
  }
  const field = (key: keyof ArrangementDraft, label: string, type = 'text') => review && <label>{label}<input className="chalk-input" aria-label={`Import ${label}`} type={type} value={String(review.draft[key] ?? '')} maxLength={key === 'detail' ? 2000 : 200} onChange={e => setReview({ ...review, draft: { ...review.draft, [key]: e.target.value } })} /></label>
  return <details className="confirmation-import"><summary>Import a confirmation</summary>
    <p className="small dim">Flight, hotel or transport. Read on this device; review before saving.</p>
    <Btn kind="ghost" disabled={busy} onClick={() => input.current?.click()}>upload PDF</Btn><input ref={input} type="file" accept="application/pdf,.pdf" aria-label="Confirmation PDF" hidden onChange={e => { void pick(e.target.files?.[0]); e.target.value = '' }} />
    <label>Or paste booking text<textarea className="chalk-input" aria-label="Booking confirmation text" value={text} maxLength={150000} onChange={e => { setText(e.target.value); setReview(null) }} /></label>
    <Btn kind="ghost" disabled={busy || !text.trim()} onClick={async () => { setBusy(true); try { await parse(text, { id: uid(), name: 'booking-text.txt', mime: 'text/plain', bytes: new TextEncoder().encode(text), addedAt: new Date().toISOString() }) } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) } }}>review extracted details</Btn>
    {busy && <p role="status">Reading confirmation…</p>}
    {review && <form className="details-form arrangement-form" aria-label="Review confirmation" onSubmit={async e => {
      e.preventDefault(); if (saving.current || !source) return; saving.current = true; setBusy(true); setMessage('')
      let stored = false
      try {
        if (duplicateBooking(trip.bookings, review.draft, hash)) throw new Error('This confirmation is already saved to this trip.')
        const booking = { ...savedArrangement(review.draft, `import-${hash}`), importHash: hash, originalId: retain ? source.id : undefined }
        if (retain) { await saveOriginal(workspace.storageKey, source); stored = true }
        dispatch({ type: 'saveBooking', tripId: trip.id, booking }); setReview(null); setSource(null); setText(''); setMessage('Saved travel details. No reservation was made.')
      } catch (e) { if (stored) await deleteOriginal(workspace.storageKey, source.id).catch(() => {}); setMessage((e as Error).message) } finally { saving.current = false; setBusy(false) }
    }}>
      <h3>Check your confirmation</h3><ul className="small dim">{review.warnings.map(w => <li key={w}>{w}</li>)}</ul>
      <label>Type<select className="chalk-input" aria-label="Import type" value={review.draft.kind} onChange={e => setReview({ ...review, draft: { ...review.draft, kind: e.target.value as ArrangementDraft['kind'] } })}><option value="flight">Flight</option><option value="stay">Hotel</option><option value="transfer">Transport</option></select></label>
      {review.draft.kind === 'flight' ? <>{field('from', 'From')}{field('to', 'To')}{field('airline', 'Airline')}{field('number', 'Flight number')}</> : field('title', 'Name')}
      {field('date', review.draft.kind === 'stay' ? 'Check in' : 'Departure date', 'date')}{field('time', 'Local time', 'time')}
      {review.draft.kind === 'stay' && field('end', 'Check out', 'date')}
      {review.draft.kind === 'flight' && <>{field('arrival', 'Arrival local date and time', 'datetime-local')}{field('departureZone', 'Departure time zone')}{field('arrivalZone', 'Arrival time zone')}</>}
      {field('address', 'Address')}{field('ref', 'Confirmation reference')}{field('contact', 'Contact email', 'email')}{field('detail', 'Notes')}
      <label className="small"><input type="checkbox" checked={retain} onChange={e => setRetain(e.target.checked)} /> Keep original on this device</label>
      <p className="small dim">Originals are encrypted with this browser’s device key, accessible to anyone using this workspace. No cloud backup. Download or delete beside the saved record. Passport and visa files belong in the separate passphrase vault.</p>
      <div className="ac-buttons"><Btn type="submit" disabled={busy}>save reviewed details</Btn><Btn type="button" kind="ghost" disabled={busy} onClick={() => { setReview(null); setSource(null) }}>cancel</Btn></div>
    </form>}
    {message && <p role="status">{message}</p>}
  </details>
}
