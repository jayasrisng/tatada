import { useEffect, useRef, useState } from 'react'
import { useStore, type ViaServer } from '../state/store'
import { useUI } from '../state/ui'
import { draftPayload, useServer } from '../state/server'
import { SUGGESTIONS } from '../magic/engine'
import { isEmail } from '../magic/stay'
import type { ChatMessage, DetailsForm, StayDetails } from '../types'
import { ActionCard } from './ActionCard'
import { ServerActionCard } from './ServerActionCard'
import { Doodle } from './Doodle'
import { Btn, Chip } from './ui'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function MagicSheet() {
  const { magic, closeMagic } = useUI()
  const { state, ask, dispatch } = useStore()
  const server = useServer()
  const [text, setText] = useState('')
  const [tripId, setTripId] = useState<string | undefined>()
  const endRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const handled = useRef<typeof magic>(null)
  const [itemId, setItemId] = useState<string | undefined>()

  // Server path for email requests: mock Fo always, live Fo once connected.
  const viaServer: ViaServer | undefined =
    server.info.available && (server.info.provider === 'mock' || server.info.foConnected)
      ? async (email, trip, checklistItemId) => {
          const a = await server.create(draftPayload(email, trip, state.profile, checklistItemId))
          return a.id
        }
      : undefined

  useEffect(() => {
    if (!magic || handled.current === magic) return
    handled.current = magic
    const t = magic.tripId ?? state.trips.find((x) => x.status !== 'past')?.id
    setTripId(t)
    if (magic.autoSend && magic.prefill) {
      void ask(magic.prefill, t, magic.itemId, undefined, true, viaServer)
      setText('')
      setItemId(undefined)
    } else {
      setText(magic.prefill ?? '')
      setItemId(magic.itemId)
    }
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [magic])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [state.chat.length, state.actions, server.actions])

  // Escape closes; Tab stays inside the dialog.
  useEffect(() => {
    if (!magic) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return closeMagic()
      if (e.key !== 'Tab' || !sheetRef.current) return
      const els = [...sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (!els.length) return
      const first = els[0]
      const last = els[els.length - 1]
      if (!sheetRef.current.contains(document.activeElement)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [magic, closeMagic])

  if (!magic) return null
  const trip = state.trips.find((t) => t.id === tripId)
  const send = (p: string) => {
    if (!p.trim()) return
    void ask(p.trim(), tripId, itemId, undefined, true, viaServer)
    setText('')
    setItemId(undefined)
  }
  const contexts = state.trips.filter((t) => t.status !== 'past')
  const mode = !server.info.available
    ? 'demo mode · Tatada server offline, so actions are simulated in this browser'
    : server.info.provider === 'mock'
      ? 'mock Fo · real approval pipeline, no real emails'
      : server.info.foConnected
        ? 'live Fo · approved emails are really sent'
        : 'live Fo not connected · connect it from your profile'

  return (
    <div className="magic-sheet" role="dialog" aria-modal="true" aria-labelledby="magic-title" ref={sheetRef}>
      <div className="magic-top">
        <button className="iconbtn" onClick={closeMagic} aria-label="Close Magic">
          <Doodle name="x" size={24} />
        </button>
        <h2 className="magic-title" id="magic-title">
          <Doodle name="sparkle" size={26} className="spin-slow" /> Magic
        </h2>
        {state.chat.length > 0 ? (
          <button className="linkbtn" onClick={() => dispatch({ type: 'clearChat' })}>
            clear
          </button>
        ) : (
          <span />
        )}
      </div>

      <div className="magic-context" role="group" aria-label="Trip context">
        <span className="dim">for</span>
        {contexts.map((t) => (
          <Chip key={t.id} on={tripId === t.id} tint={t.tint} onClick={() => (setTripId(t.id), setItemId(undefined))}>
            {t.destination}
          </Chip>
        ))}
        <Chip on={!tripId} onClick={() => (setTripId(undefined), setItemId(undefined))}>
          anything
        </Chip>
      </div>

      <div className="magic-thread" aria-live="polite">
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
        {state.chat.map((m) => (
          <Bubble key={m.id} m={m} viaServer={viaServer} />
        ))}
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
          ref={inputRef}
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
        <Doodle name="lock" size={14} /> {mode}
      </p>
    </div>
  )
}

function Bubble({ m, viaServer }: { m: ChatMessage; viaServer?: ViaServer }) {
  const { state } = useStore()
  const server = useServer()
  const action = m.actionId ? state.actions.find((a) => a.id === m.actionId) : undefined
  const sAction = m.serverActionId ? server.actions[m.serverActionId] : undefined
  return (
    <div className={`bubble ${m.from}`}>
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
      {m.form && <DetailsFormCard form={m.form} messageId={m.id} viaServer={viaServer} />}
      {action && <ActionCard action={action} />}
      {m.serverActionId && (sAction ? <ServerActionCard action={sAction} /> : <p className="dim small">{server.info.available ? 'loading the request…' : 'The Tatada server is offline. This request will reappear when it\'s back.'}</p>)}
    </div>
  )
}

function DetailsFormCard({ form, messageId, viaServer }: { form: DetailsForm; messageId: string; viaServer?: ViaServer }) {
  const { state, dispatch, ask } = useStore()
  const trip = state.trips.find((t) => t.id === form.tripId)
  const [values, setValues] = useState<StayDetails>({})
  const [error, setError] = useState<string | null>(null)
  if (form.submitted) return <p className="added"><Doodle name="tick" size={16} /> details saved to your trip</p>
  if (!trip) return null

  const submit = () => {
    for (const f of form.fields) {
      const v = values[f.key]?.trim()
      if (f.required && !v) return setError(`${f.label} is needed.`)
      if (f.key === 'hotelEmail' && v && !isEmail(v)) return setError('That email address doesn\'t look right.')
      if (f.key === 'checkIn' && v && (v < trip.start || v > trip.end)) return setError(`Check-in should fall within your trip (${trip.start} to ${trip.end}).`)
    }
    setError(null)
    // A delay's new arrival time is for this email only; don't overwrite the trip's plan.
    const { arrivalTime, ...rest } = values
    dispatch({ type: 'saveStayDetails', tripId: trip.id, details: form.intent === 'delay' ? rest : values, messageId })
    void ask(form.prompt, trip.id, form.itemId, { ...values, arrivalTime }, false, viaServer)
  }

  return (
    <form
      className="details-form"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {form.fields.map((f) => (
        <label key={f.key}>
          <span>{f.label}</span>
          <input
            className="chalk-input"
            type={f.type}
            required={f.required}
            min={f.type === 'date' ? trip.start : undefined}
            max={f.type === 'date' ? trip.end : undefined}
            placeholder={f.placeholder}
            value={values[f.key] ?? ''}
            onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
          />
        </label>
      ))}
      {error && <p className="ac-problem" role="alert">{error}</p>}
      <Btn kind="solid" type="submit">
        use these details
      </Btn>
    </form>
  )
}
