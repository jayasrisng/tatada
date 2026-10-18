import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { DressCode, Garment, GarmentCategory, ItineraryItem, Trip } from '../types'
import { uid, useStore } from '../state/store'
import { Doodle } from '../components/Doodle'
import { Avatar } from '../components/Avatar'
import { Btn, Chip, Heading, TopBar } from '../components/ui'
import { fmtDay } from '../magic/dates'
import { byCategory, dayCode, generateLooks, packingList, tripDays, type Suggestion } from '../style/looks'
import { hashQuery } from '../state/ui'
import { processPhoto } from '../style/camera'
import { garmentImage } from '../style/images'
import { extractClothes, type ExtractedPiece } from '../style/extract'

type Tab = 'itinerary' | 'closet' | 'mix' | 'swipe' | 'board'
const TABS: { id: Tab; label: string }[] = [
  { id: 'swipe', label: 'swipe' },
  { id: 'mix', label: 'mix' },
  { id: 'closet', label: 'closet' },
  { id: 'itinerary', label: 'itinerary' },
  { id: 'board', label: 'board' },
]
const CATS: { id: GarmentCategory; label: string }[] = [
  { id: 'top', label: 'tops' },
  { id: 'bottom', label: 'bottoms' },
  { id: 'dress', label: 'dresses' },
  { id: 'layer', label: 'layers' },
  { id: 'shoes', label: 'shoes' },
]
const DRESS: DressCode[] = ['casual', 'active', 'dressy', 'cold']
const MAX_CAMERA = 24

export function Style() {
  const { state } = useStore()
  const trips = state.trips.filter((t) => t.status !== 'past').sort((a, b) => a.start.localeCompare(b.start))
  const [tripId, setTripId] = useState(trips[0]?.id)
  const [tab, setTab] = useState<Tab>(hashQuery().has('photo') ? 'closet' : 'swipe')
  const trip = trips.find((t) => t.id === tripId) ?? trips[0]
  const wardrobe = state.wardrobe ?? []
  const camera = useRef<HTMLInputElement>(null)

  return (
    <div className="screen style style-screen">
      <TopBar back="/" />
      <Heading tint="var(--pink)" sub="your closet, mixed and matched for the trip">
        Style
      </Heading>
      <div className="style-camera no-print">
        <Btn kind="solid" icon="camera" onClick={() => { setTab('closet'); camera.current?.click() }}>
          add clothing · camera / upload
        </Btn>
        <p className="dim small">Your closet saves in this browser. On a phone, you can take a photo.</p>
      </div>

      {trips.length > 0 && (
        <div className="chips no-print" role="group" aria-label="Trip">
          {trips.map((t) => (
            <Chip key={t.id} tint={t.tint} on={t.id === trip?.id} onClick={() => setTripId(t.id)}>
              {t.destination}
            </Chip>
          ))}
        </div>
      )}

      <nav className="seg style-seg no-print" role="tablist" aria-label="Style sections">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <div hidden={tab !== 'closet'}><Closet wardrobe={wardrobe} input={camera} /></div>
      {!trip && tab !== 'closet' && <p className="empty">Plan a trip first, then style it here.</p>}
      {trip && tab === 'itinerary' && <Itinerary key={trip.id} trip={trip} />}
      {trip && tab === 'mix' && <Mix key={trip.id} trip={trip} wardrobe={wardrobe} />}
      {trip && tab === 'swipe' && <Swipe key={trip.id} trip={trip} wardrobe={wardrobe} onDone={() => setTab('board')} />}
      {trip && tab === 'board' && <Board trip={trip} wardrobe={wardrobe} onSwipe={() => setTab('swipe')} />}
    </div>
  )
}

/* ───────────── closet + camera ───────────── */

function Closet({ wardrobe, input }: { wardrobe: Garment[]; input: RefObject<HTMLInputElement | null> }) {
  const { state, dispatch } = useStore()
  const [filter, setFilter] = useState<GarmentCategory | 'all'>('all')
  const [drafts, setDrafts] = useState<(ExtractedPiece & { selected: boolean })[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const cameraCount = wardrobe.filter((g) => g.source === 'camera').length
  const shown = filter === 'all' ? wardrobe : wardrobe.filter((g) => g.category === filter)

  const snap = async (file?: File) => {
    if (!file) return
    setError(null)
    if (cameraCount >= MAX_CAMERA) return setError('Remove a camera photo before adding another.')
    setBusy(true)
    setDrafts([])
    try {
      const p = await processPhoto(file)
      const pieces = p.isolated ? [{ image: p.dataUrl, color: p.color, name: 'My garment', category: 'top' as const, isolated: true }] : await extractClothes(file, setProgress)
      setDrafts(pieces.map((piece) => ({ ...piece, selected: true })))
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false); setProgress('') }
  }

  useEffect(() => {
    const photo = state.photoHistory?.find((p) => p.id === hashQuery().get('photo'))
    if (!photo || !photo.image.startsWith('data:image/')) return
    history.replaceState(null, '', `${location.pathname}${location.search}#/style`)
    void fetch(photo.image).then((r) => r.blob()).then((blob) => snap(new File([blob], photo.filename, { type: blob.type }))).catch((e) => setError((e as Error).message))
  }, [])

  return (
    <section aria-label="Closet">
      {busy && <p role="status">{progress || 'Preparing photo…'} Your photo stays on this device.</p>}
      {drafts.length > 0 && (
        <form className="details-form" onSubmit={(e) => {
          e.preventDefault()
          const selected = drafts.filter((d) => d.selected)
          if (!selected.length || selected.some((d) => !d.name.trim())) return setError('Select a piece and give it a name.')
          if (cameraCount + selected.length > MAX_CAMERA) return setError('Remove some camera pieces before adding more.')
          if (JSON.stringify(state).length + selected.reduce((n, d) => n + d.image.length, 0) > 1_500_000) return setError('Photo storage is full. Export a backup, then remove some photos.')
          for (const d of selected) dispatch({ type: 'addGarment', garment: { id: uid(), name: d.name.trim(), category: d.category, color: d.color, vibe: ['casual'], image: d.image, isolated: true, source: 'camera', addedAt: Date.now() } })
          setDrafts([]); setError(null)
        }}>
          <h3 className="section-h">{drafts.length} piece{drafts.length === 1 ? '' : 's'} ready for your closet</h3>
          <p className="dim small">Keep the pieces you still own. Old travel photos can include clothes you've since given away.</p>
          {drafts.map((d, i) => <div className="detected-piece" key={i}>
            <input type="checkbox" aria-label={`Keep detected piece ${i + 1}`} checked={d.selected} onChange={(e) => setDrafts((all) => all.map((p, j) => j === i ? { ...p, selected: e.target.checked } : p))} />
            <img src={d.image} alt={d.name} className="closet-preview" />
            <label><span>piece name</span><input className="chalk-input" value={d.name} placeholder="e.g. striped linen shirt" onChange={(e) => setDrafts((all) => all.map((p, j) => j === i ? { ...p, name: e.target.value } : p))} /></label>
            <select aria-label={`Category for piece ${i + 1}`} value={d.category} onChange={(e) => setDrafts((all) => all.map((p, j) => j === i ? { ...p, category: e.target.value as GarmentCategory } : p))}>{CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          </div>)}
          <div className="ac-buttons"><Btn kind="solid" type="submit">add to closet</Btn><Btn kind="ghost" type="button" onClick={() => setDrafts([])}>discard</Btn></div>
          <p className="dim small">Automatic detection removes background and skin from visible clothes. It cannot reconstruct hidden fabric or reliably separate layered garments. Review edges and categories before adding. First use downloads a detector; photos are processed locally.</p>
        </form>
      )}
      <div className="chips wrap">
        <Chip on={filter === 'all'} onClick={() => setFilter('all')}>
          all {wardrobe.length}
        </Chip>
        {CATS.map((c) => (
          <Chip key={c.id} on={filter === c.id} onClick={() => setFilter(c.id)}>
            {c.label} {wardrobe.filter((g) => g.category === c.id).length}
          </Chip>
        ))}
      </div>

      <div className="closet">
        <button className="closet-cam" onClick={() => input.current?.click()} disabled={busy || cameraCount >= MAX_CAMERA} aria-label="Take a photo of a piece of clothing">
          <Doodle name="camera" size={40} />
          <span>snap a piece</span>
        </button>
        <input ref={input} type="file" accept="image/*" capture="environment" disabled={busy} hidden onChange={(e) => (snap(e.target.files?.[0]), (e.target.value = ''))} aria-label="Camera" />
        {shown.map((g, i) => (
          <figure key={g.id} className="closet-item" style={{ transform: `rotate(${((i * 37) % 5) - 2}deg)` }}>
            {g.image ? <img src={garmentImage(g.image)} alt={g.name} loading="lazy" /> : <span className="closet-swatch" style={{ background: g.color }} />}
            <figcaption>
              <span>{g.name}</span>
              <button className="iconbtn small-x" onClick={() => dispatch({ type: 'deleteGarment', id: g.id })} aria-label={`Remove ${g.name}`}>
                <Doodle name="trash" size={16} />
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
      {error && <p className="ac-problem" role="alert">{error}</p>}
      {cameraCount >= MAX_CAMERA && <p className="dim small">That's {MAX_CAMERA} camera photos, the most this device keeps. Remove one to add another.</p>}


    </section>
  )
}

/* ───────────── itinerary ───────────── */

function Itinerary({ trip }: { trip: Trip }) {
  const { dispatch } = useStore()
  const [editing, setEditing] = useState<ItineraryItem | null>(null)
  const days = tripDays(trip)
  const items = trip.itinerary ?? []

  return (
    <section aria-label="Itinerary" className="itinerary">
      {days.map((day) => (
        <div key={day} className="it-day">
          <h3 className="section-h">
            {fmtDay(day)} <span className={`tag code-${dayCode(trip, day)}`}>{dayCode(trip, day)}</span>
          </h3>
          <ul>
            {items
              .filter((i) => i.day === day)
              .map((i) =>
                editing?.id === i.id ? (
                  <ItemForm key={i.id} trip={trip} value={editing} onSave={(v) => (dispatch({ type: 'saveItinerary', tripId: trip.id, item: v }), setEditing(null))} onCancel={() => setEditing(null)} />
                ) : (
                  <li key={i.id} className="it-item">
                    <button className="it-main" onClick={() => setEditing(i)} aria-label={`Edit ${i.title}`}>
                      <span className="it-time">{i.time ?? '—'}</span>
                      <span>{i.title}</span>
                      <span className={`tag code-${i.dress}`}>{i.dress}</span>
                    </button>
                    <button className="iconbtn danger" onClick={() => dispatch({ type: 'deleteItinerary', tripId: trip.id, id: i.id })} aria-label={`Delete ${i.title}`}>
                      <Doodle name="trash" size={18} />
                    </button>
                  </li>
                ),
              )}
          </ul>
          {editing && editing.day === day && !items.some((i) => i.id === editing.id) ? (
            <ItemForm trip={trip} value={editing} onSave={(v) => (dispatch({ type: 'saveItinerary', tripId: trip.id, item: v }), setEditing(null))} onCancel={() => setEditing(null)} />
          ) : (
            <button className="linkbtn small" onClick={() => setEditing({ id: uid(), day, time: '', title: '', dress: 'casual' })}>
              + add to {fmtDay(day).split(',')[0]}
            </button>
          )}
        </div>
      ))}
      <p className="dim small">Dress codes steer the outfit suggestions. Mark an evening "cold" to get a layer.</p>
    </section>
  )
}

function ItemForm({ trip, value, onSave, onCancel }: { trip: Trip; value: ItineraryItem; onSave: (v: ItineraryItem) => void; onCancel: () => void }) {
  const [v, setV] = useState(value)
  return (
    <form
      className="details-form it-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (v.title.trim()) onSave({ ...v, title: v.title.trim(), time: v.time || undefined })
      }}
    >
      <input className="chalk-input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="what's happening?" aria-label="Plan" autoFocus />
      <div className="it-row">
        <input className="chalk-input" type="date" value={v.day} min={trip.start} max={trip.end} onChange={(e) => setV({ ...v, day: e.target.value })} aria-label="Day" />
        <input className="chalk-input" type="time" value={v.time ?? ''} onChange={(e) => setV({ ...v, time: e.target.value })} aria-label="Time" />
      </div>
      <div className="chips wrap">
        {DRESS.map((d) => (
          <Chip key={d} on={v.dress === d} onClick={() => setV({ ...v, dress: d })}>
            {d}
          </Chip>
        ))}
      </div>
      <div className="ac-buttons">
        <Btn kind="solid" type="submit" disabled={!v.title.trim()}>
          save
        </Btn>
        <Btn kind="ghost" type="button" onClick={onCancel}>
          cancel
        </Btn>
      </div>
    </form>
  )
}

/* ───────────── mix & match ───────────── */

function Mix({ trip, wardrobe }: { trip: Trip; wardrobe: Garment[] }) {
  const { dispatch } = useStore()
  const c = byCategory(wardrobe)
  const [mode, setMode] = useState<'separates' | 'dress'>(c.top.length && c.bottom.length ? 'separates' : 'dress')
  const [idx, setIdx] = useState<Record<GarmentCategory, number>>({ top: 0, bottom: 0, dress: 0, layer: -1, shoes: 0 })
  const [day, setDay] = useState<string | undefined>(tripDays(trip)[0])
  const [saved, setSaved] = useState(false)
  const pick = (cat: GarmentCategory) => (idx[cat] >= 0 ? c[cat][idx[cat] % Math.max(1, c[cat].length)] : undefined)
  const outfit = [mode === 'dress' ? pick('dress') : pick('top'), mode === 'dress' ? undefined : pick('bottom'), pick('layer'), pick('shoes')].filter((g): g is Garment => !!g)
  const slots: GarmentCategory[] = mode === 'dress' ? ['dress', 'layer', 'shoes'] : ['top', 'layer', 'bottom', 'shoes']
  const step = (cat: GarmentCategory, d: number) => {
    setSaved(false)
    const n = c[cat].length
    if (!n) return
    // Layers can be "none" (-1); everything else cycles.
    setIdx((p) => ({ ...p, [cat]: cat === 'layer' ? ((p.layer + 1 + d + n + 1) % (n + 1)) - 1 : (p[cat] + d + n) % n }))
  }

  return (
    <section aria-label="Mix and match" className="mix">
      <div className="chips center">
        <Chip on={mode === 'separates'} onClick={() => setMode('separates')}>
          top + bottom
        </Chip>
        <Chip on={mode === 'dress'} onClick={() => setMode('dress')}>
          dress
        </Chip>
      </div>
      <div className="mix-stage">
        <Avatar outfit={outfit} size={190} />
        <div className="mix-slots">
          {slots.map((cat) => (
            <Swiper key={cat} label={cat} item={pick(cat)} count={c[cat].length} onStep={(d) => step(cat, d)} />
          ))}
        </div>
      </div>
      <div className="mix-save">
        <select value={day ?? ''} onChange={(e) => setDay(e.target.value || undefined)} aria-label="Day for this look">
          {tripDays(trip).map((d) => (
            <option key={d} value={d}>
              {fmtDay(d)}
            </option>
          ))}
          <option value="">any day</option>
        </select>
        <Btn
          kind="solid"
          icon="heart"
          disabled={!outfit.length}
          onClick={() => {
            dispatch({ type: 'swipeLook', look: { id: uid(), tripId: trip.id, garmentIds: outfit.map((g) => g.id), day, verdict: 'keep', at: Date.now() } })
            setSaved(true)
          }}
        >
          {saved ? 'on the board' : 'keep this look'}
        </Btn>
      </div>
    </section>
  )
}

/** One clothing slot: swipe the photo sideways or tap the arrows. */
function Swiper({ label, item, count, onStep }: { label: string; item?: Garment; count: number; onStep: (d: number) => void }) {
  const start = useRef<number | null>(null)
  return (
    <div className="swiper">
      <button className="iconbtn" onClick={() => onStep(-1)} aria-label={`Previous ${label}`} disabled={!count}>
        <Doodle name="back" size={20} />
      </button>
      <div
        className="swiper-card"
        onPointerDown={(e) => (start.current = e.clientX)}
        onPointerUp={(e) => {
          if (start.current === null) return
          const dx = e.clientX - start.current
          start.current = null
          if (Math.abs(dx) > 30) onStep(dx < 0 ? 1 : -1)
        }}
      >
        {item?.image ? <img src={garmentImage(item.image)} alt="" draggable={false} /> : <span className="closet-swatch" style={{ background: item?.color ?? 'transparent' }} />}
        <span className="swiper-label">{item ? item.name : count ? `no ${label}` : `no ${label}s yet`}</span>
      </div>
      <button className="iconbtn flip" onClick={() => onStep(1)} aria-label={`Next ${label}`} disabled={!count}>
        <Doodle name="back" size={20} />
      </button>
    </div>
  )
}

/* ───────────── swipe deck ───────────── */

function Swipe({ trip, wardrobe, onDone }: { trip: Trip; wardrobe: Garment[]; onDone: () => void }) {
  const { state, dispatch } = useStore()
  // Fixed for this visit, so the deck doesn't reshuffle as you swipe.
  const [deck] = useState<Suggestion[]>(() => generateLooks(wardrobe, trip, state.looks ?? []))
  const [i, setI] = useState(0)
  const [dx, setDx] = useState(0)
  const start = useRef<number | null>(null)
  const byId = useMemo(() => new Map(wardrobe.map((g) => [g.id, g])), [wardrobe])
  const kept = (state.looks ?? []).filter((l) => l.tripId === trip.id && l.verdict === 'keep').length

  if (!wardrobe.length) return <p className="empty">Your closet is empty. Add pieces in the closet tab.</p>
  const card = deck[i]
  const decide = (verdict: 'keep' | 'skip') => {
    if (!card) return
    dispatch({ type: 'swipeLook', look: { id: uid(), tripId: trip.id, garmentIds: card.garmentIds, day: card.day, verdict, at: Date.now() } })
    setDx(0)
    setI(i + 1)
  }

  if (!card) {
    return (
      <div className="swipe-done">
        <Doodle name="heart" size={44} />
        <p className="chalk-title">that's every idea for now</p>
        <p className="dim">{kept} {kept === 1 ? 'look' : 'looks'} kept for {trip.destination}.</p>
        <Btn kind="solid" icon="book" onClick={onDone}>
          see the moodboard
        </Btn>
      </div>
    )
  }

  const outfit = card.garmentIds.map((id) => byId.get(id)).filter((g): g is Garment => !!g)
  return (
    <section aria-label="Swipe outfits" className="swipe">
      <p className="dim small center-text">
        {i + 1} / {deck.length} · swipe right to pack, left to skip
      </p>
      <div
        className="swipe-card"
        style={{ transform: `translateX(${dx}px) rotate(${dx / 18}deg)` }}
        onPointerDown={(e) => {
          start.current = e.clientX
          ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
        }}
        onPointerMove={(e) => start.current !== null && setDx(e.clientX - start.current)}
        onPointerUp={() => {
          start.current = null
          if (dx > 90) decide('keep')
          else if (dx < -90) decide('skip')
          else setDx(0)
        }}
        data-testid="swipe-card"
      >
        {dx > 40 && <span className="swipe-stamp keep">pack</span>}
        {dx < -40 && <span className="swipe-stamp skip">skip</span>}
        <p className="swipe-why">{card.why}</p>
        <Avatar outfit={outfit} size={170} still />
        <div className="swipe-pieces">
          {outfit.map((g) => (
            <figure key={g.id}>
              {g.image ? <img src={garmentImage(g.image)} alt={g.name} draggable={false} /> : <span className="closet-swatch" style={{ background: g.color }} />}
              <figcaption>{g.name}</figcaption>
            </figure>
          ))}
        </div>
      </div>
      <div className="swipe-buttons">
        <Btn kind="ghost" icon="x" onClick={() => decide('skip')}>
          skip
        </Btn>
        <Btn kind="solid" icon="heart" onClick={() => decide('keep')}>
          pack it
        </Btn>
      </div>
      <button className="linkbtn small center-text" onClick={onDone}>
        jump to the moodboard ({kept} kept)
      </button>
    </section>
  )
}

/* ───────────── moodboard ───────────── */

function Board({ trip, wardrobe, onSwipe }: { trip: Trip; wardrobe: Garment[]; onSwipe: () => void }) {
  const { state, dispatch } = useStore()
  const byId = new Map(wardrobe.map((g) => [g.id, g]))
  const kept = (state.looks ?? []).filter((l) => l.tripId === trip.id && l.verdict === 'keep').sort((a, b) => (a.day ?? '9').localeCompare(b.day ?? '9'))
  const { groups, count } = packingList(wardrobe, state.looks ?? [], trip.id)
  const onList = new Set(state.items.filter((i) => i.tripId === trip.id).map((i) => i.text.trim().toLowerCase()))
  const toAdd = Object.values(groups).flat().filter((g) => !onList.has(`pack: ${g.name}`.toLowerCase()))

  if (!kept.length) {
    return (
      <div className="swipe-done">
        <p className="chalk-title">nothing on the board yet</p>
        <p className="dim">Swipe right on looks you like, or keep one from mix.</p>
        <Btn kind="solid" onClick={onSwipe}>
          start swiping
        </Btn>
      </div>
    )
  }

  return (
    <section className="moodboard" aria-label="Packing moodboard">
      <h2 className="chalk-title print-title">{trip.destination} · what to pack</h2>
      <div className="board-looks">
        {kept.map((l, n) => {
          const outfit = l.garmentIds.map((id) => byId.get(id)).filter((g): g is Garment => !!g)
          return (
            <figure key={l.id} className="board-look" style={{ transform: `rotate(${((n * 41) % 7) - 3}deg)` }}>
              <Avatar outfit={outfit} size={92} still />
              <div className="board-pics">
                {outfit.slice(0, 4).map((g) => (g.image ? <img key={g.id} src={garmentImage(g.image)} alt={g.name} /> : <span key={g.id} className="closet-swatch" style={{ background: g.color }} />))}
              </div>
              <figcaption>
                {l.day ? fmtDay(l.day) : 'any day'}
                <button className="iconbtn small-x no-print" onClick={() => dispatch({ type: 'unkeepLook', id: l.id })} aria-label="Remove look from board">
                  <Doodle name="x" size={14} />
                </button>
              </figcaption>
            </figure>
          )
        })}
      </div>

      <h3 className="section-h">
        pack {count} {count === 1 ? 'piece' : 'pieces'}
      </h3>
      <ul className="pack-list">
        {CATS.filter((c) => groups[c.id].length).map((c) => (
          <li key={c.id}>
            <strong>{c.label}</strong> {groups[c.id].map((g) => g.name).join(' · ')}
          </li>
        ))}
      </ul>
      <div className="ac-buttons no-print">
        <Btn
          kind="solid"
          icon="check"
          disabled={!toAdd.length}
          onClick={() => {
            for (const g of toAdd) dispatch({ type: 'addItem', item: { id: uid(), tripId: trip.id, phase: 'prepare', text: `Pack: ${g.name}`, done: false, kind: 'pack' } })
          }}
        >
          {toAdd.length ? `add ${toAdd.length} to packing checklist` : 'all on your checklist'}
        </Btn>
        <Btn kind="ghost" icon="printer" onClick={() => window.print()}>
          print board
        </Btn>
        <Btn kind="ghost" onClick={() => dispatch({ type: 'resetLooks', tripId: trip.id })}>
          start over
        </Btn>
      </div>
    </section>
  )
}
