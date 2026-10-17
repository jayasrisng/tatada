import { useEffect, useState } from 'react'
import { useServer } from '../state/server'
import { hashQuery } from '../state/ui'
import { Doodle } from './Doodle'
import { Btn } from './ui'

const RESULT: Record<string, string> = {
  connected: 'Fo is connected.',
  denied: 'You declined access on Wajo, so nothing was connected.',
  error: 'Connecting Fo didn\'t work.',
  unavailable: 'The server is in mock mode.',
}

export function FoConnection() {
  const { info, refresh } = useServer()
  const [busy, setBusy] = useState(false)
  const q = hashQuery()
  const result = q.get('fo')
  const reason = q.get('reason')

  useEffect(() => {
    if (result) void refresh()
  }, [result, refresh])

  const disconnect = async () => {
    setBusy(true)
    await fetch('/api/fo/disconnect', { method: 'POST', headers: { 'x-tatada': '1' }, credentials: 'same-origin' }).catch(() => {})
    await refresh()
    setBusy(false)
  }

  return (
    <section className="fo-connection" aria-labelledby="fo-h">
      <h2 id="fo-h" className="section-h">
        <Doodle name="bolt" size={22} /> Fo
      </h2>
      {result && (
        <p className={result === 'connected' ? 'added' : 'ac-problem'} role="status">
          {RESULT[result] ?? 'Something happened.'}
          {reason ? ` (${reason})` : ''}
        </p>
      )}
      {!info.available ? (
        <p className="dim">The Tatada server isn't running, so Magic simulates actions in this browser. Start it with <code>npm run server</code>.</p>
      ) : info.provider === 'mock' ? (
        <p className="dim">Mock Fo: every request goes through the real approval and verification pipeline, but no email is sent. To use your real Fo, restart the server with <code>npm run server:live</code>.</p>
      ) : info.foConnected ? (
        <>
          <p>Connected to your Wajo account. Approved emails are really sent.</p>
          <p className="dim small">Live sends are limited to: {info.liveRecipients?.length ? info.liveRecipients.join(', ') : 'nobody yet (set TATADA_LIVE_RECIPIENTS)'}</p>
          <Btn kind="ghost" disabled={busy} onClick={disconnect}>
            disconnect
          </Btn>
        </>
      ) : (
        <>
          <p>Connect your Wajo account so Fo can send emails you approve. You'll sign in on Wajo; Tatada never sees your password, and its token stays on the Tatada server.</p>
          <a className="btn btn-solid" href="/api/fo/connect">
            <span>connect Fo</span>
          </a>
        </>
      )}
    </section>
  )
}
