import { useRef, useState, type ReactNode } from 'react'
import { useStore } from '../state/store'
import { go, useUI } from '../state/ui'
import { CurvyArrow, Doodle } from '../components/Doodle'
import { daysUntil } from '../components/ui'
import { LISBON_DINNER } from '../data/seed'
import type { CanvasPos } from '../types'

/* Default spots on the board, as fractions of its width/height. */
const DEFAULTS: Record<string, CanvasPos> = {
  trips: { x: 0.05, y: 0.04, r: -3 },
  tasks: { x: 0.53, y: 0.08, r: 2.5 },
  next: { x: 0.56, y: 0.66, r: 4 },
  note: { x: 0.04, y: 0.68, r: -4 },
  style: { x: 0.02, y: 0.43, r: -6 },
}

function Draggable({ id, children, onTap, className }: { id: string; children: ReactNode; onTap: () => void; className?: string }) {
  const { state, dispatch } = useStore()
  const pos = state.canvas[id] ?? DEFAULTS[id]
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null)
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const el = useRef<HTMLDivElement>(null)

  const onDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY, moved: false }
    el.current?.setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return
    const dx = e.clientX - start.current.x
    const dy = e.clientY - start.current.y
    if (!start.current.moved && Math.hypot(dx, dy) < 7) return
    start.current.moved = true
    setDrag({ dx, dy })
  }
  const onUp = () => {
    const s = start.current
    start.current = null
    if (!s) return
    if (!s.moved) return onTap()
    const board = el.current?.parentElement?.getBoundingClientRect()
    const me = el.current?.getBoundingClientRect()
    if (board && me && drag) {
      const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max)
      const x = clamp(pos.x + drag.dx / board.width, 1 - me.width / board.width)
      const y = clamp(pos.y + drag.dy / board.height, 1 - me.height / board.height)
      dispatch({ type: 'moveCard', id, pos: { x, y, r: pos.r } })
    }
    setDrag(null)
  }

  return (
    <div
      ref={el}
      className={`canvas-card ${drag ? 'dragging' : ''} ${className ?? ''}`}
      style={{
        left: `${pos.x * 100}%`,
        top: `${pos.y * 100}%`,
        transform: `translate(${drag?.dx ?? 0}px, ${drag?.dy ?? 0}px) rotate(${drag ? 0 : pos.r}deg) scale(${drag ? 1.05 : 1})`,
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => ((start.current = null), setDrag(null))}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onTap())}
      role="button"
      tabIndex={0}
    >
      {children}
    </div>
  )
}

export function Home() {
  const { state } = useStore()
  const { openMagic } = useUI()
  const upcoming = state.trips.filter((t) => t.status !== 'past').sort((a, b) => a.start.localeCompare(b.start))
  const next = upcoming[0]
  const open = state.items.filter((i) => !i.done).length
  const done = state.items.filter((i) => i.done).length
  const needsYou = state.actions.filter((a) => a.status === 'needs_input' || a.status === 'proposed').length
  const days = next ? daysUntil(next.start) : 0

  return (
    <div className="screen home">
      <header className="home-top">
        <span className="logo">tatada</span>
        <button className="avatar" onClick={() => go('/welcome')} aria-label="Your profile">
          {state.profile.name.slice(0, 1) || '?'}
        </button>
      </header>
      <p className="home-hi">hi {state.profile.name.toLowerCase() || 'there'} ✶</p>

      <div className="board" aria-label="Your canvas. Drag cards around.">
        <Draggable id="trips" onTap={() => go('/trips')} className="cc-trips">
          <Doodle name="suitcase" size={44} />
          <strong>Trips</strong>
          <span className="cc-meta">{state.trips.length}</span>
        </Draggable>

        <Draggable id="tasks" onTap={() => go('/tasks')} className="cc-tasks">
          <Doodle name="check" size={44} />
          <strong>Tasks</strong>
          <span className="cc-meta">
            {open} open
            {needsYou > 0 && <i className="dot inline">{needsYou}</i>}
          </span>
          <span className="cc-bar">
            <i style={{ width: `${(done / Math.max(done + open, 1)) * 100}%` }} />
          </span>
        </Draggable>

        <Draggable id="style" onTap={() => go('/style')} className="cc-style">
          <Doodle name="shirt" size={28} />
          <span>Style</span>
        </Draggable>

        {next && (
          <Draggable id="next" onTap={() => go(`/trip/${next.id}`)} className={`cc-polaroid tint-${next.tint}`}>
            <div className="polaroid-pic">
              <Doodle name="plane" size={38} />
            </div>
            <strong>{next.destination}</strong>
            <span>{days > 0 ? `in ${days} days` : days === 0 ? 'today!' : 'now'}</span>
          </Draggable>
        )}

        <Draggable
          id="note"
          onTap={() => openMagic({ tripId: 'lisbon', prefill: LISBON_DINNER, itemId: state.items.find((i) => i.magicPrompt === LISBON_DINNER && !i.done)?.id })}
          className="cc-note"
        >
          <span>Saturday dinner isn't booked yet</span>
          <em>
            <Doodle name="sparkle" size={14} /> Fo can call
          </em>
        </Draggable>

        <div className="board-magic">
          <CurvyArrow className="magic-arrow" flip />
          <button className="magic-orb" onClick={() => openMagic()} aria-label="Magic">
            <Doodle name="sparkle" size={46} stroke={2.2} />
          </button>
          <span className="magic-label">magic</span>
        </div>
      </div>
    </div>
  )
}
