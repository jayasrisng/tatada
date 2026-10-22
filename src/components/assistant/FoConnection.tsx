import { beginSignIn, apiUrl, usesBearer, sessionHeaders, browserOnly } from '../../config'
import { useEffect, useState } from 'react'
import { useStore } from '../../state/store'
import { api,useServer } from '../../state/server'
import { go, hashQuery } from '../../state/ui'
import { Doodle } from '../layout/Doodle'
import { Btn } from '../layout/ui'

const RESULT: Record<string, string> = {
  connected: 'Fo is connected.',
  denied: 'You declined access on Wajo, so nothing was connected.',
  error: 'Connecting Fo didn\'t work.',
  unavailable: 'The server is in mock mode.',
}

interface Diagnostics {
  provider: string
  checkedAt: number
  tools?: { name: string; readOnly?: boolean; destructive?: boolean; openWorld?: boolean }[]
  toolsError?: string
  conversations?: { count: number; shape: unknown }
  conversationsError?: string
}

interface Observation {
  grant: string
  status: number
  fields: string[]
  accessTokenFormat: string
  jwtClaimNames?: string[]
  expiresIn?: number
  refreshRotated?: boolean
}

/** Read-only connection check: tools/list and the shape of list_fo_conversations. */
function ReadOnlyCheck() {
  const [d, setD] = useState<Diagnostics | null>(null)
  const [obs, setObs] = useState<Observation[] | null>(null)
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)
  const loadObs = async () => setObs((await (await fetch(apiUrl('/api/fo/oauth-observations'), { credentials: usesBearer ? 'omit' : 'include', headers: sessionHeaders() })).json()).observations)
  const testRefresh = async () => {
    setRefreshMsg('refreshing…')
    const res = await fetch(apiUrl('/api/fo/test-refresh'), { method: 'POST', headers: { ...sessionHeaders(), 'x-tatada': '1' }, credentials: usesBearer ? 'omit' : 'include' })
    const body = await res.json()
    setRefreshMsg(res.ok ? `Refresh worked${body.observation?.refreshRotated ? ' (refresh token rotated)' : ''}.` : `Refresh failed: ${body.error}${body.connected === false ? '. Reconnect Fo.' : ''}`)
    await loadObs()
  }
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch(apiUrl('/api/fo/diagnostics'), { credentials: usesBearer ? 'omit' : 'include', headers: sessionHeaders() })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? res.status)
      setD(body)
      await loadObs()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="fo-check">
      <Btn kind="ghost" icon="search" disabled={busy} onClick={run}>
        {busy ? 'checking…' : 'check connection (read-only)'}
      </Btn>
      {err && <p className="ac-problem" role="alert">{err}</p>}
      {d && (
        <div className="fo-check-result" role="status">
          {d.tools ? (
            <ul>
              {d.tools.map((t) => (
                <li key={t.name}>
                  <code>{t.name}</code> {t.readOnly ? <span className="tag ok">read-only</span> : <span className="tag warn">acts{t.destructive ? ' · can\'t undo' : ''}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="ac-problem">tools/list failed: {d.toolsError}</p>
          )}
          {d.conversations ? (
            <p className="dim small">
              list_fo_conversations: {d.conversations.count >= 0 ? `${d.conversations.count} conversations` : 'unrecognized format'} · shape {JSON.stringify(d.conversations.shape).slice(0, 160)}
            </p>
          ) : (
            <p className="ac-problem">list_fo_conversations failed: {d.conversationsError}</p>
          )}
          <p className="dim small">Nothing was sent. Only read-only tools were called.</p>
          {obs?.map((o, i) => (
            <p key={i} className="dim small">
              token response ({o.grant === 'refresh_token' ? 'refresh' : 'sign-in'}, {o.status}): fields {o.fields.join(', ')} · access token {o.accessTokenFormat}
              {o.jwtClaimNames ? ` with claims ${o.jwtClaimNames.join(', ')}` : ''}
              {o.expiresIn ? ` · expires in ${Math.round(o.expiresIn / 60)} min` : ''}
            </p>
          ))}
          <Btn kind="ghost" onClick={testRefresh}>
            test token refresh
          </Btn>
          {refreshMsg && <p className="small" role="status">{refreshMsg}</p>}
        </div>
      )}
    </div>
  )
}

export function FoConnection() {
  const { workspace } = useStore()
  const { info, refresh, logout } = useServer()
  const [busy, setBusy] = useState(false)
  const [disconnectError, setDisconnectError] = useState<string | null>(null)
  const q = hashQuery()
  const result = q.get('fo')
  const reason = q.get('reason')

  useEffect(() => {
    if (result) void refresh()
  }, [result, refresh])

  const disconnect = async () => {
    setBusy(true)
    setDisconnectError(null)
    try {
      if(info.authMethod==='supabase'){await api('/api/fo/disconnect',{method:'POST'});await refresh()}else await logout(false)
      go('/welcome')
    } catch (e) {
      setDisconnectError(`Could not disconnect Fo: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  if (browserOnly) return <section className="fo-connection"><h2 className="section-h">Fo · connect the live app</h2><p className="dim">This browser-only build saves your trips and closet here. Wajo sign-in and live actions require the connected Tatada backend.</p></section>

  if (workspace.storageKey.endsWith(':preview')) return <section className="fo-connection"><h2 className="section-h">Fo preview</h2><p className="dim">This sample workspace uses simulated actions. Return to live Tatada to authorize Fo.</p></section>

  return (
    <section className="fo-connection" aria-labelledby="fo-h">
      <h2 id="fo-h" className="section-h">
        <Doodle name="bolt" size={22} /> Fo
      </h2>
      {disconnectError && <p className="ac-problem" role="alert">{disconnectError}</p>}
      {result && (
        <p className={result === 'connected' ? 'added' : 'ac-problem'} role="status">
          {RESULT[result] ?? 'Something happened.'}
          {reason ? ` (${reason})` : ''}
        </p>
      )}
      {!info.available ? (
        <p className="dim">You’re exploring the sample. Connect to live Tatada to use your Wajo account.</p>
      ) : info.provider === 'mock' ? (
        <p className="dim">This is a sample connection. No email is sent.</p>
      ) : info.foConnected ? (
        <>
          <p>Your Wajo account is connected. You can reopen your conversations here.</p><p className="small dim">Approved print requests use the delivery service enabled for this release. Check Your printer for its status.</p>

          <a className="btn btn-ghost" href={apiUrl('/api/auth/wajo/start')} onClick={beginSignIn}>Reconnect my Wajo account</a>
          {info.foAuth==='api_key'&&<p className="small dim">This local session currently uses your private owner key. Reconnecting authorizes Wajo directly for this workspace.</p>}
          <details className="connection-details"><summary>Connection details</summary><ReadOnlyCheck /></details>
          <Btn kind="ghost" disabled={busy} onClick={disconnect}>
            disconnect
          </Btn>
        </>
      ) : (
        <>
          <p>Fo is not authorized. Connect your Wajo account to use real Fo; your workspace stays as it is.</p>
          <a className="btn btn-solid" href={apiUrl('/api/auth/wajo/start')} onClick={beginSignIn}>
            <span>{info.owner||info.authMethod==='supabase' ? 'connect Wajo' : 'sign in with Wajo'}</span>
          </a>
        </>
      )}
    </section>
  )
}
