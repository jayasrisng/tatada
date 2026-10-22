import {ContextPicker} from '../components/assistant/ContextPicker'
import {printRoute} from '../print/intent'
import {go} from '../state/ui'
import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import type { DressCode, Garment, GarmentCategory, ItineraryItem, Trip } from '../types'
import { uid, useStore } from '../state/store'
import { Doodle } from '../components/layout/Doodle'
import { Avatar } from '../components/layout/Avatar'
import { Btn, Chip, Heading, TopBar } from '../components/layout/ui'
import { TodayStyleChat } from '../components/assistant/TodayStyleChat'
import { useUI } from '../state/ui'
import { useToday } from '../state/today'
import { localToday, fmtDay } from '../magic/dates'
import { byCategory, dayCode, generateLooks, packingList, tripDays, type Suggestion } from '../style/looks'
import { garmentImage } from '../style/images'

type Tab = 'itinerary' | 'closet' | 'mix' | 'swipe' | 'board'
const TABS: { id: Tab; label: string }[] = [
  { id: 'swipe', label: 'outfits' },
  { id: 'mix', label: 'mix & match' },
  { id: 'closet', label: 'closet' },
  { id: 'itinerary', label: 'day plan' },
  { id: 'board', label: 'packing' },
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

// The importer (EXIF reader, detector glue) loads only when someone adds photos.
const PhotoImport = lazy(() => import('../components/journal/PhotoImport').then((m) => ({ default: m.PhotoImport })))

/** A stand-in "trip" for styling today: never stored, no itinerary or packing list. */
const todayTrip = (): Trip => ({ id: 'today', destination: 'today', country: '', start: localToday(), end: localToday(), travelers: 1, companions: '', budget: 0, vibe: [], constraints: [], discounts: [], status: 'upcoming', tint: 'pink', summary: {}, options: [], bookings: [], memories: [] })

export function Style() {
  const { state } = useStore()
  const { focusTripId } = useUI()
  useToday()
  const trips = state.trips.filter((t) => t.status !== 'past').sort((a, b) => a.start.localeCompare(b.start))
  // "today" unless the traveler picks a trip; Style never silently selects one.
  const [tripId, setTripId] = useState<string | undefined>(undefined)
  const [tab, setTab] = useState<Tab>('swipe')
  const [importing, setImporting] = useState(false)
  const chosen = trips.find((t) => t.id === (focusTripId ?? tripId))
  const trip = chosen ?? todayTrip()
  const wardrobe = state.wardrobe ?? []

  return (
    <div className="screen style style-screen">
      <TopBar back="/" />
      <Heading tint="var(--pink)" sub={chosen?.destination==='Yosemite'?'Pack your bags. The mountains are calling.':'Pack your bags. The world is calling.'}>
        Closet
      </Heading>
      <ContextPicker label="Closet for" trips={trips} value={chosen?.id} onChange={setTripId} locked={!!focusTripId}/>

      {!chosen && <TodayStyleChat />}
      <nav className="seg style-seg no-print" role="tablist" aria-label="Closet sections">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {(tab === 'closet' || !wardrobe.length) && <div className="style-camera no-print">
        <Btn kind="solid" icon="camera" disabled={importing} onClick={() => { setTab('closet'); setImporting(true) }}>
          add from photos
        </Btn>
        <p className="dim small">Import once to add clothes and places. Review what to keep before saving.</p>
      </div>}
      {importing && <Suspense fallback={<p className="small dim">opening…</p>}><PhotoImport onClose={() => setImporting(false)} /></Suspense>}


      <div hidden={tab !== 'closet'}><Closet wardrobe={wardrobe} onAdd={() => setImporting(true)} /></div>
      {!chosen && (tab === 'itinerary' || tab === 'board') && <p className="empty">Pick a trip above to plan outfits for its days and packing.</p>}
      {chosen && tab === 'itinerary' && <Itinerary key={chosen.id} trip={chosen} />}
      {tab === 'mix' && <Mix key={trip.id} trip={trip} wardrobe={wardrobe} />}
      {tab === 'swipe' && <Swipe key={trip.id} trip={trip} wardrobe={wardrobe} onDone={() => setTab(chosen ? 'board' : 'mix')} />}
      {chosen && tab === 'board' && <Board trip={chosen} wardrobe={wardrobe} onSwipe={() => setTab('swipe')} />}
    </div>
  )
}

/* ───────────── closet + camera ───────────── */

function Closet({ wardrobe, onAdd }: { wardrobe: Garment[]; onAdd: () => void }) {
  const { dispatch } = useStore()
  const [filter, setFilter] = useState<GarmentCategory | 'all'>('all')
  const cameraCount = wardrobe.filter((g) => g.source === 'camera').length
  const shown = filter === 'all' ? wardrobe : wardrobe.filter((g) => g.category === filter)

  return (
    <section aria-label="Closet">
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
        <button className="closet-cam" onClick={onAdd} disabled={cameraCount >= MAX_CAMERA} aria-label="Add clothes from photos">
          <Doodle name="camera" size={40} />
          <span>add from photos</span>
        </button>
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
          see saved outfits
        </Btn>
      </div>
    )
  }

  const outfit = card.garmentIds.map((id) => byId.get(id)).filter((g): g is Garment => !!g)
  return (
    <section aria-label="Swipe outfits" className="swipe">
      <p className="dim small center-text">
        {i + 1} / {deck.length} · swipe right to save, left to skip
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
          save outfit
        </Btn>
      </div>
      <button className="linkbtn small center-text" onClick={onDone}>
        saved outfits & packing ({kept})
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
        <p className="chalk-title">No saved outfits yet</p>
        <p className="dim">Save an outfit from Outfits or Mix & match, then find your packing list here.</p>
        <Btn kind="solid" onClick={onSwipe}>
          find an outfit
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
        <Btn kind="ghost" icon="printer" onClick={() => go(printRoute(trip.id,'packing'))}>
          print packing list
        </Btn>
        <Btn kind="ghost" onClick={() => dispatch({ type: 'resetLooks', tripId: trip.id })}>
          start over
        </Btn>
      </div>
    </section>
  )
}
