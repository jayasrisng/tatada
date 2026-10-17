import { useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useServer } from '../state/server'
import { go } from '../state/ui'
import { buildExport, parseImport } from '../state/portability'
import { Doodle } from './Doodle'
import { Btn } from './ui'

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
    const out = buildExport(state, Object.values(server.actions))
    download(`tatada-export-${out.exportedAt.slice(0, 10)}.json`, JSON.stringify(out, null, 2))
    setMsg({ ok: true, text: 'Exported. The file holds your trips, tasks, memories, Magic history and past requests. No passwords or tokens.' })
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
      {workspace.kind === 'wajo' && (
        <>
          <p>Signed in with Wajo{info.account?.since ? ` since ${new Date(info.account.since).toLocaleDateString()}` : ''}.</p>
          {!info.foConnected && (
            <p className="ac-problem">
              Wajo access ended (expired or revoked). <a href="/api/auth/wajo/start">Sign in with Wajo again</a> to keep using Fo. Your data is safe.
            </p>
          )}
          <div className="ac-buttons">
            <Btn kind="ghost" onClick={() => server.logout(false)}>
              sign out
            </Btn>
            <Btn kind="ghost" onClick={() => server.logout(true)}>
              sign out everywhere
            </Btn>
          </div>
        </>
      )}
      {workspace.kind !== 'wajo' && <p className="dim">Demo workspace with sample data. It isn't a real account.</p>}

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
      {(state.archivedActions?.length ?? 0) > 0 && <p className="dim small">{state.archivedActions!.length} past requests kept as read-only history.</p>}
    </section>
  )
}
