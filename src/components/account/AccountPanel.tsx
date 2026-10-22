import {api} from '../../state/server'
import {AccountLifecycle} from './AccountLifecycle'
import { beginSignIn, apiUrl, browserOnly } from '../../config'
import { useRef, useState } from 'react'
import { useStore } from '../../state/store'
import { useServer } from '../../state/server'
import { go } from '../../state/ui'
import { buildExport, parseImport } from '../../state/portability'
import { Doodle } from '../layout/Doodle'
import { Btn } from '../layout/ui'

const download = (name: string, text: string) => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** Account, sign-out, and your data: export, import, recovery. */
export function AccountPanel() {
  const { state, dispatch, workspace } = useStore()
  const server = useServer()
  const { info } = server
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, setPending] = useState<ReturnType<typeof parseImport> | null>(null)
  const recoveryKey = `${workspace.storageKey}:recovery`
  const recovery = (() => {
    try {
      return localStorage.getItem(recoveryKey)
    } catch {
      return null
    }
  })()

  const exportAll = () => {
    const out = buildExport(state, workspace.storageKey.endsWith(':preview') ? [] : Object.values(server.actions))
    download(`tatada-export-${out.exportedAt.slice(0, 10)}.json`, JSON.stringify(out, null, 2))
    setMsg({ ok: true, text: 'Exported. The file holds your trips, closet photos, saved outfits, travel-photo timeline, tasks, memories, Magic history and past requests. No passwords or tokens.' })
  }

  const pick = async (f?: File) => {
    if (!f) return
    const r = parseImport(await f.text())
    if (!r.ok) return setMsg({ ok: false, text: r.error })
    setPending(r)
    setMsg(null)
  }

  return (
    <section className="account-panel" aria-labelledby="acct-h">
      <h2 id="acct-h" className="section-h">
        <Doodle name="heart" size={20} /> you
      </h2>
      {(workspace.kind === 'wajo' || workspace.kind === 'connected') && (
        <>
          <p>{info.authMethod==='supabase'?'Signed in with verified email':workspace.kind === 'connected' ? 'Fo connected for this session' : 'Signed in with Wajo'}{info.account?.since ? ` since ${new Date(info.account.since).toLocaleDateString()}` : ''}.</p>
          {!info.foConnected && (
            <p className="ac-problem">
              Wajo access ended (expired or revoked). <a href={apiUrl('/api/auth/wajo/start')} onClick={beginSignIn}>Sign in with Wajo again</a> to keep using Fo. Your data is safe.
            </p>
          )}
          <div className="ac-buttons">
            <Btn kind="ghost" onClick={() => void server.logout(false).catch((e) => setMsg({ ok: false, text: `Could not sign out: ${e.message}` }))}>
              sign out
            </Btn>
            <Btn kind="ghost" onClick={() => void server.logout(true).catch((e) => setMsg({ ok: false, text: `Could not sign out: ${e.message}` }))}>
              sign out everywhere
            </Btn>
          </div>
        </>
      )}
      {workspace.kind === 'owner' && <p className="dim">Your private workspace on this computer. Fo authorization is managed below.</p>}
      {workspace.kind !== 'wajo' && workspace.kind !== 'owner' && workspace.kind !== 'connected' && <p className="dim">{browserOnly ? 'Saved in this browser on this device. Export a backup before clearing browser data or moving to another device.' : "Demo workspace with sample data. It isn't a real account."}</p>}

      {workspace.kind === 'connected' && info.authMethod!=='supabase' && <p className="dim small">Wajo did not provide a stable account ID. This is a private connection session, not a reusable Wajo account. Download an account recovery key before signing out. Use it on a new device to restore this workspace before reconnecting Wajo. Keep an export as a separate data backup.</p>}
      {info.authMethod!=='supabase'&&(workspace.kind==='connected'||workspace.kind==='wajo')&&<div><h3>Account recovery</h3><p className="small">Save a one-use recovery key before signing out or changing devices. Anyone with the key can access this workspace; keep it privately. A new key replaces the old one.</p><Btn kind="ghost" onClick={async()=>{try{const result=await api<{key:string}>('/api/account/recovery-key',{method:'POST',json:{}});download('tatada-account-recovery.json',JSON.stringify({recoveryKey:result.key,notice:'Keep privately. One use; restore in Tatada before reconnecting Wajo.'},null,2));setMsg({ok:true,text:'Recovery key downloaded. Store it somewhere private outside this browser.'})}catch(e){setMsg({ok:false,text:(e as Error).message})}}}>download account recovery key</Btn></div>}
      <h3 className="section-h small-h">your data</h3>
      <div className="ac-buttons">
        <Btn kind="ghost" icon="book" onClick={exportAll}>
          export
        </Btn>
        <Btn kind="ghost" icon="plus" onClick={() => file.current?.click()}>
          import
        </Btn>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ''))} aria-label="Import a Tatada export" />
        {recovery && (
          <Btn kind="ghost" onClick={() => download('tatada-recovery.json', recovery)}>
            download recovery copy
          </Btn>
        )}
      </div>
      {recovery && <p className="dim small">A damaged copy of your data was set aside earlier. Download it, then import it to try restoring it.</p>}
      {pending?.ok && (
        <div className="details-form" role="alertdialog" aria-label="Confirm import">
          <p>
            Replace this workspace with the imported one? It has {pending.state.trips.length} trips, {pending.state.items.length} tasks and {pending.actions} past requests (kept as history; nothing re-runs).
          </p>
          <div className="ac-buttons">
            <Btn
              kind="solid"
              onClick={() => {
                dispatch({ type: 'reset', state: pending.state })
                setPending(null)
                setMsg({ ok: true, text: 'Imported.' })
                go('/')
              }}
            >
              replace
            </Btn>
            <Btn kind="ghost" onClick={() => setPending(null)}>
              cancel
            </Btn>
          </div>
        </div>
      )}
      {msg && (
        <p className={msg.ok ? 'added' : 'ac-problem'} role="status">
          {msg.text}
        </p>
      )}
      <AccountLifecycle exportOnly />
      {(state.archivedActions?.length ?? 0) > 0 && <p className="dim small">{state.archivedActions!.length} past requests kept as read-only history.</p>}
    </section>
  )
}
