import { useEffect, useRef, useState } from 'react'
import type { Trip } from '../types'
import * as fo from '../state/foChat'
import { fmtRange } from './ui'
import { Doodle } from './Doodle'
import { Btn } from './ui'

const newKey = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('')
const tripContext = (t: Trip) => `Trip context: ${t.destination}${t.country ? `, ${t.country}` : ''}, ${fmtRange(t.start, t.end)}, ${t.travelers} ${t.travelers === 1 ? 'traveler' : 'travelers'}.`

/**
 * A conversation with the real Fo, through Tatada's server. Opening it only
 * checks the connection (read-only). Every message is previewed and sent on
 * an explicit tap; risky requests need separate confirmation.
 */
export function FoChatPanel({ trip, onSimulated }: { trip?: Trip; onSimulated: () => void }) {
  const [status, setStatus] = useState<fo.FoState | 'connecting'>('connecting')
  const [chat, setChat] = useState<fo.FoChat | null>(null)
  const [text, setText] = useState('')
  const [withTrip, setWithTrip] = useState(true)
  const [confirmed, setConfirmed] = useState<fo.RiskCategory[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const key = useRef(newKey())
  const endRef = useRef<HTMLDivElement>(null)

  // Connection check (tools/list) and the latest conversation for this context.
  useEffect(() => {
    let live = true
    setStatus('connecting')
    setChat(null)
    fo.foStatus()
      .then((s) => live && setStatus(s))
      .catch((e) => live && setStatus({ state: 'error', provider: 'live', error: (e as Error).message }))
    fo.listChats(trip?.id)
      .then((list) => live && setChat(list[0] ?? null))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [trip?.id])

  // Follow progress while Fo is working.
  const working = !!chat && fo.BUSY.includes(chat.status)
  useEffect(() => {
    if (!chat || !working) return
    const t = window.setInterval(() => fo.getChat(chat.id).then(setChat).catch(() => {}), 1200)
    return () => clearInterval(t)
  }, [chat?.id, working])

  useEffect(() => {
    // Block body: scrollIntoView may return a Promise in newer browsers, which React treats as a bad cleanup.
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chat?.turns.length, chat?.progress, chat?.pending])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const preview = () =>
    run(async () => {
      const c = chat ?? (await fo.createChat(trip?.id))
      const first = !c.turns.length
      setChat(await fo.prepare(c.id, text.trim(), trip && withTrip && first ? tripContext(trip) : undefined))
      setConfirmed([])
      key.current = newKey()
    })

  const sendIt = () =>
    run(async () => {
      if (!chat?.pending) return
      setChat(await fo.send(chat.id, chat.pending.hash, key.current, confirmed))
      setText('')
    })

  const connected = status !== 'connecting' && status.state === 'connected'
  const provider = status !== 'connecting' ? status.provider : undefined
  const pending = chat?.pending
  const allConfirmed = !!pending && pending.risk.every((r) => confirmed.includes(r))

  return (
    <>
      <div className={`fo-conn ${status === 'connecting' ? 'connecting' : status.state}`} role="status">
        <span className="fo-dot" />
        {status === 'connecting'
          ? 'Connecting to Fo…'
          : status.state === 'connected'
            ? `Connected to ${provider === 'mock' ? 'mock Fo (demo, nothing real happens)' : 'Wajo Fo'}`
            : status.state === 'disconnected'
              ? 'Disconnected: Fo isn\'t authorized yet'
              : `Can't reach Fo: ${status.error ?? 'unknown error'}`}
        {chat && (
          <button className="linkbtn small" onClick={() => run(async () => setChat(await fo.createChat(trip?.id)))} disabled={busy || working}>
            new conversation
          </button>
        )}
      </div>

      {status !== 'connecting' && status.state !== 'connected' && (
        <div className="fo-auth">
          <p>Tatada needs your permission to use Fo from your Wajo account. You'll approve it on Wajo; the authorization stays on this computer's Tatada server.</p>
          <div className="ac-buttons">
            <a className="btn btn-solid" href="/api/auth/wajo/start">
              <span>authorize Fo</span>
            </a>
            <Btn kind="ghost" onClick={onSimulated}>
              use simulated mode
            </Btn>
          </div>
        </div>
      )}

      <div className="magic-thread" aria-live="polite">
        {(!chat || !chat.turns.length) && connected && !pending && (
          <div className="magic-empty">
            <p className="magic-hello">what can Fo help with?</p>
            <p className="dim small center-text">Messages go to the real Fo{provider === 'mock' ? ' (mock)' : ''} only after you preview and tap send.</p>
          </div>
        )}
        {chat?.turns.map((t) => (
          <div key={t.id} className={`bubble ${t.role === 'me' ? 'me' : 'tatada'} fo-turn ${t.kind ?? ''}`}>
            {t.role === 'fo' && <span className="fo-who">{provider === 'mock' ? 'mock Fo' : 'Fo'} {t.kind === 'question' ? 'asks' : t.kind === 'error' ? 'reports a problem' : 'says'}</span>}
            <p className="fo-text">{t.text}</p>
            {t.role === 'me' && t.delivery && t.delivery !== 'delivered' && <span className={`fo-delivery ${t.delivery}`}>{t.delivery === 'sending' ? 'sending…' : t.delivery === 'uncertain' ? 'checking whether Fo got it…' : 'not delivered'}</span>}
          </div>
        ))}
        {working && (
          <p className="fo-progress">
            <Doodle name="bolt" size={16} /> {chat?.progress ?? (chat?.status === 'send_uncertain' ? 'Checking with Fo before doing anything else…' : 'Fo is working…')}
          </p>
        )}
        {chat?.error && !working && (
          <p className="ac-problem" role="alert">
            {chat.error}{' '}
            {chat.status === 'timeout' && (
              <button className="linkbtn" onClick={() => run(async () => setChat(await fo.checkAgain(chat.id)))}>
                check again
              </button>
            )}
          </p>
        )}

        {pending && (
          <div className="action-card fo-preview real" data-testid="fo-preview">
            <div className="ac-title">
              <strong>Send this to Fo?</strong>
              <span className="ac-status">exactly this text will be sent</span>
            </div>
            <pre className="fo-message">{pending.message}</pre>
            {pending.risk.length > 0 && (
              <div className="fo-risks">
                <p className="ac-problem">This may lead Fo to act in the real world. Confirm each one:</p>
                {pending.risk.map((r) => (
                  <label key={r} className="fo-risk">
                    <input type="checkbox" checked={confirmed.includes(r)} onChange={(e) => setConfirmed(e.target.checked ? [...confirmed, r] : confirmed.filter((x) => x !== r))} />
                    <span>{fo.RISK_LABELS[r]}. I'm OK with that.</span>
                  </label>
                ))}
              </div>
            )}
            <div className="ac-buttons">
              <Btn kind="solid" icon="arrow" disabled={busy || !allConfirmed} onClick={sendIt}>
                Send to Fo
              </Btn>
              <Btn kind="ghost" disabled={busy} onClick={() => run(async () => setChat(await fo.discard(chat!.id)))}>
                Edit
              </Btn>
            </div>
          </div>
        )}
        {error && (
          <p className="ac-problem" role="alert">
            {error}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="magic-input fo-input"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim() && !working && connected) void preview()
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={!connected ? 'authorize Fo to start' : chat?.status === 'needs_input' ? 'answer Fo…' : trip ? `ask Fo about ${trip.destination}…` : 'ask Fo anything…'}
          aria-label="Message to Fo"
          disabled={!connected || working}
        />
        <button type="submit" className="send" aria-label="Preview message" disabled={!text.trim() || !connected || working || busy}>
          <Doodle name="arrow" size={24} />
        </button>
      </form>
      {trip && (!chat || !chat.turns.length) && (
        <label className="fo-ctx small">
          <input type="checkbox" checked={withTrip} onChange={(e) => setWithTrip(e.target.checked)} /> include trip dates and party size in the first message
        </label>
      )}
    </>
  )
}
