import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useUI } from '../state/ui'
import { SUGGESTIONS } from '../magic/engine'
import { ActionCard } from './ActionCard'
import { Doodle } from './Doodle'
import { Chip } from './ui'

export function MagicSheet() {
  const { magic, closeMagic } = useUI()
  const { state, ask, dispatch } = useStore()
  const [text, setText] = useState('')
  const [tripId, setTripId] = useState<string | undefined>()
  const endRef = useRef<HTMLDivElement>(null)
  const handled = useRef<typeof magic>(null)
  const [itemId, setItemId] = useState<string | undefined>()

  useEffect(() => {
    if (!magic || handled.current === magic) return
    handled.current = magic
    const t = magic.tripId ?? state.trips.find((x) => x.status !== 'past')?.id
    setTripId(t)
    if (magic.autoSend && magic.prefill) {
      ask(magic.prefill, t, magic.itemId)
      setText('')
      setItemId(undefined)
    } else {
      setText(magic.prefill ?? '')
      setItemId(magic.itemId)
    }
  }, [magic])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [state.chat.length, state.actions])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeMagic()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeMagic])

  if (!magic) return null
  const trip = state.trips.find((t) => t.id === tripId)
  const send = (p: string) => {
    if (!p.trim()) return
    ask(p.trim(), tripId, itemId)
    setText('')
    setItemId(undefined)
  }
  const contexts = state.trips.filter((t) => t.status !== 'past')

  return (
    <div className="magic-sheet" role="dialog" aria-modal="true" aria-label="Magic">
      <div className="magic-top">
        <button className="iconbtn" onClick={closeMagic} aria-label="Close Magic">
          <Doodle name="x" size={24} />
        </button>
        <div className="magic-title">
          <Doodle name="sparkle" size={26} className="spin-slow" /> Magic
        </div>
        {state.chat.length > 0 ? (
          <button className="linkbtn" onClick={() => dispatch({ type: 'clearChat' })}>
            clear
          </button>
        ) : (
          <span />
        )}
      </div>

      <div className="magic-context">
        <span className="dim">for</span>
        {contexts.map((t) => (
          <Chip key={t.id} on={tripId === t.id} tint={t.tint} onClick={() => { setTripId(t.id); setItemId(undefined) }}>
            {t.destination}
          </Chip>
        ))}
        <Chip on={!tripId} onClick={() => { setTripId(undefined); setItemId(undefined) }}>
          anything
        </Chip>
      </div>

      <div className="magic-thread">
        {state.chat.length === 0 && (
          <div className="magic-empty">
            <p className="magic-hello">what can I take off your plate?</p>
            <div className="magic-suggest">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="suggest" onClick={() => send(s)}>
                  <Doodle name="arrow" size={18} /> {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {state.chat.map((m) => {
          const action = m.actionId ? state.actions.find((a) => a.id === m.actionId) : undefined
          return (
            <div key={m.id} className={`bubble ${m.from}`}>
              <p>{m.text}</p>
              {m.bullets && (
                <ul>
                  {m.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
              {m.addedItems && (
                <p className="added">
                  <Doodle name="tick" size={16} /> added {m.addedItems.length} to your checklist
                </p>
              )}
              {action && <ActionCard action={action} />}
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      <form
        className="magic-input"
        onSubmit={(e) => {
          e.preventDefault()
          send(text)
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={trip ? `ask anything about ${trip.destination}…` : 'ask anything…'}
          aria-label="Ask Magic"
        />
        <button type="submit" className="send" aria-label="Send" disabled={!text.trim()}>
          <Doodle name="arrow" size={24} />
        </button>
      </form>
      <p className="magic-mode">
        <Doodle name="lock" size={14} /> demo mode · actions are simulated until the Fo bridge is connected
      </p>
    </div>
  )
}
