import { useRef, useState } from 'react'
import { useStore, uid } from '../../state/store'
import { localToday } from '../../magic/dates'
import type { Memory, Trip } from '../../types'
import { Btn } from '../layout/ui'

/** Decode only the chosen file, strip metadata, and bound the saved copy before it enters account state. */
async function journalPhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 20_000_000) throw new Error('Choose a JPG, PNG or WebP under 20 MB.')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image(); image.src = url; await image.decode()
    const canvas = document.createElement('canvas')
    const ratio = Math.min(1, 960 / Math.max(image.naturalWidth, image.naturalHeight))
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio))
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Photo preview is unavailable in this browser.')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.75, 0.55, 0.35, 0.2]) {
      const data = canvas.toDataURL('image/jpeg', quality)
      if (data.length <= 85000) return data
    }
    throw new Error('This photo is too detailed to save here. Try a smaller copy.')
  } finally { URL.revokeObjectURL(url) }
}

export function MomentComposer({ trip }: {trip: Trip}) {
  const {state, dispatch} = useStore()
  const [text, setText] = useState(''), [place, setPlace] = useState(''), [day, setDay] = useState(localToday)
  const [image, setImage] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false)
  const file = useRef<HTMLInputElement>(null), selection = useRef(0)
  async function attach(chosen?: File) {
    const current = ++selection.current
    setError(''); setSaved(false); setImage('')
    if (!chosen) {setBusy(false); return}
    setBusy(true)
    try {const photo = await journalPhoto(chosen); if (current === selection.current) setImage(photo)}
    catch (e) {if (current === selection.current) setError((e as Error).message)}
    finally {if (current === selection.current) setBusy(false)}
  }
  return <form className="moment-composer" onSubmit={e => {
    e.preventDefault(); setError(''); setSaved(false)
    if (busy || (!image && !text.trim())) return
    const memory: Memory = {id: uid(), day, text: text.trim(), place: place.trim() || undefined, kind: image ? 'photo' : 'note', image: image || undefined, tint: 'yellow'}
    const next = {...state, trips: state.trips.map(t => t.id === trip.id ? {...t, memories: [...t.memories, memory]} : t)}
    // Leave room for JSON envelope and subsequent edits under the existing 1 MB workspace limit.
    if (new TextEncoder().encode(JSON.stringify(next)).length > 900000) return setError('Your journal storage is nearly full. Export your data before adding more photos. This moment has not been saved.')
    dispatch({type:'addMemory', tripId:trip.id, memory}); setText(''); setPlace(''); setImage(''); setSaved(true)
    if (file.current) file.current.value = ''
  }}>
    <label><span className="sr-only">A moment to keep</span><textarea maxLength={3000} value={text} onChange={e => {setText(e.target.value); setSaved(false)}} placeholder="Write a moment here…" aria-label="Moment note" /></label>
    <div className="moment-fields"><label>When<input type="date" required value={day} onChange={e => setDay(e.target.value)} /></label><label><span className="sr-only">Where (optional)</span><input aria-label="Where (optional)" maxLength={150} value={place} onChange={e => setPlace(e.target.value)} placeholder="Add a place (optional)…" /></label></div>
    <label className="moment-attach">Add a photo<input ref={file} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => void attach(e.target.files?.[0])} /></label>
    {image && <div className="moment-preview"><img src={image} alt="Photo to save in your journal" /><button type="button" className="linkbtn" onClick={() => {++selection.current; setImage(''); if(file.current) file.current.value=''}}>remove photo</button></div>}
    <p className="small dim">Saved to this trip, with a small copy of your photo. Included in your account backup and journal PDF. No photo is sent to Fo.</p>
    {error && <p role="alert">{error}</p>}{saved && <p role="status">Saved to your journal. Go live the next bit.</p>}
    <Btn type="submit" kind="solid" disabled={busy || (!image && !text.trim())}>{busy ? 'getting your photo ready…' : 'save moment'}</Btn>
  </form>
}
