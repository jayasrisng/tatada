import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppState } from '../types'
import { useServer } from '../state/server'
import { StoreProvider, type Workspace } from '../state/store'
import { UIProvider, hashQuery } from '../state/ui'
import { accountKey, isAppState, loadState, saveState, STORAGE_KEY } from '../state/persistence'
import { emptyState } from '../data/seed'
import { App } from '../App'
import { Doodle, MagicBuddy } from './Doodle'
import { Btn } from './ui'

/*
 * Who's using Tatada decides which workspace loads:
 *   - live server, signed in with Wajo   → that account's workspace (server is the source of truth)
 *   - live server, not signed in         → Continue with Wajo (the only way in)
 *   - mock server                        → a labeled demo account
 *   - no server                          → optional local demo in this browser only
 */
export function AuthGate() {
  const server = useServer()
  const { info } = server
  const [localDemo, setLocalDemo] = useState(false)
  const [loaded, setLoaded] = useState<{ accountId: string; version: number; state?: AppState; gen: number } | null>(null)
  const [syncNote, setSyncNote] = useState<string | null>(null)
  const version = useRef(0)
  const lastSynced = useRef<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const accountId = info.authenticated ? info.account?.id : undefined

  useEffect(() => {
    if (!accountId) return setLoaded(null)
    let live = true
    server
      .loadWorkspace()
      .then((w) => {
        if (!live) return
        version.current = w.version
        // Unsynced local edits win if the server hasn't moved on since they were made.
        const meta = readMeta(accountId)
        const local = loadState(() => window.localStorage, accountKey(accountId), emptyState)
        const keepLocal = meta?.dirty && meta.base === w.version && !local.warning
        const state = keepLocal ? local.state : isAppState(w.state) ? w.state : undefined
        lastSynced.current = keepLocal ? null : state ? JSON.stringify(state) : null
        setLoaded({ accountId, version: w.version, state, gen: 0 })
      })
      .catch(() => live && setLoaded({ accountId, version: 0, gen: 0 }))
    return () => {
      live = false
    }
  }, [accountId])

  // Debounced push to the server; a newer copy elsewhere wins and is loaded here.
  const onChange = useCallback(
    (state: AppState) => {
      if (!accountId) return
      const json = JSON.stringify(state)
      if (json === lastSynced.current) return
      writeMeta(accountId, { base: version.current, dirty: true })
      clearTimeout(timer.current)
      timer.current = window.setTimeout(async () => {
        try {
          const r = await server.saveWorkspace(version.current, state)
          if (r.ok) {
            version.current = r.version
            lastSynced.current = json
            writeMeta(accountId, { base: r.version, dirty: false })
            setSyncNote(null)
          } else if (isAppState(r.state)) {
            version.current = r.version
            lastSynced.current = JSON.stringify(r.state)
            writeMeta(accountId, { base: r.version, dirty: false })
            // Keep the local edits that lost, so nothing silently disappears.
            try {
              localStorage.setItem(`${accountKey(accountId)}:recovery`, json)
            } catch {
              /* best effort */
            }
            saveState(r.state, () => window.localStorage, accountKey(accountId))
            setSyncNote('This workspace changed on another device, so the newer copy is loaded. Your edits from here are saved as a recovery copy in your profile.')
            setLoaded((l) => l && { ...l, state: r.state as AppState, gen: l.gen + 1 })
          }
        } catch {
          setSyncNote('Saved on this device. It will sync when the Tatada server is reachable.')
        }
      }, 800)
    },
    [accountId],
  )

  if (!info.checked) return <Splash />

  if (!info.available) {
    if (localDemo) return <Mount workspace={{ kind: 'local-demo', storageKey: STORAGE_KEY }} banner="Local demo · this browser only · not signed in" />
    return <Offline onDemo={() => setLocalDemo(true)} />
  }

  if (!info.authenticated || !accountId) return <SignIn />
  if (!loaded || loaded.accountId !== accountId) return <Splash />

  const workspace: Workspace = { kind: info.account?.kind === 'wajo' ? 'wajo' : 'demo', storageKey: accountKey(accountId), onChange }
  return (
    <Mount
      key={`${accountId}:${loaded.gen}`}
      workspace={workspace}
      initialState={loaded.state}
      banner={info.account?.kind === 'demo' ? 'Demo mode · mock Fo · not a real account' : syncNote ?? undefined}
    />
  )
}

function Mount({ workspace, initialState, banner }: { workspace: Workspace; initialState?: AppState; banner?: string }) {
  return (
    <StoreProvider workspace={workspace} initialState={initialState}>
      <UIProvider>
        {banner && (
          <p className="mode-banner" role="status">
            {banner}
          </p>
        )}
        <App />
      </UIProvider>
    </StoreProvider>
  )
}

function Splash() {
  return (
    <div className="frame">
      <main className="app chromeless">
        <div className="screen center" aria-busy="true">
          <MagicBuddy size={84} />
          <span className="logo big">tatada</span>
        </div>
      </main>
    </div>
  )
}

const AUTH_MESSAGES: Record<string, string> = {
  denied: 'You declined on Wajo, so nothing was connected.',
  no_identity:
    'Wajo signed you in but didn\'t share an account ID Tatada can verify, so we can\'t open a private workspace for you. Nothing was saved. This is a Wajo-side limitation we\'re working on.',
  rate_limited: 'Too many sign-in attempts. Wait a few minutes and try again.',
  demo_mode: 'This server runs in demo mode, so there\'s no Wajo sign-in.',
  error: 'Signing in with Wajo didn\'t work.',
}

function SignIn() {
  const q = hashQuery()
  const auth = q.get('auth')
  const reason = q.get('reason')
  return (
    <div className="frame">
      <main className="app chromeless">
        <div className="screen signin">
          <div className="signin-hero">
            <MagicBuddy size={110} />
            <h1 className="logo big">tatada</h1>
            <p className="welcome-line">
              less managing travel.
              <br />
              more traveling.
            </p>
          </div>
          {auth && auth !== 'signed_in' && (
            <p className="ac-problem" role="alert">
              {AUTH_MESSAGES[auth] ?? AUTH_MESSAGES.error}
              {reason ? ` (${reason})` : ''}
            </p>
          )}
          <a className="btn btn-solid signin-btn" href="/api/auth/wajo/start">
            <Doodle name="arrow" size={20} />
            <span>Continue with Wajo</span>
          </a>
          <p className="dim small signin-fine">
            Tatada signs you in with your Wajo account. Fo only acts for you after you approve each request. Your Wajo password and tokens never reach this page.
          </p>
        </div>
      </main>
    </div>
  )
}

function Offline({ onDemo }: { onDemo: () => void }) {
  return (
    <div className="frame">
      <main className="app chromeless">
        <div className="screen center">
          <MagicBuddy size={84} />
          <h2 className="chalk-title">can't reach the Tatada server</h2>
          <p className="dim">Signing in needs the server. Start it with <code>npm run server</code>, then reload.</p>
          <Btn kind="ghost" onClick={onDemo}>
            try the local demo instead
          </Btn>
          <p className="dim small">The local demo stays in this browser, uses sample data, and can't send anything.</p>
        </div>
      </main>
    </div>
  )
}

/** Sync bookkeeping per account: the server version local edits are based on, and whether they're unsynced. */
const metaKey = (id: string) => `${accountKey(id)}:sync`
function readMeta(id: string): { base: number; dirty: boolean } | null {
  try {
    const v = JSON.parse(localStorage.getItem(metaKey(id)) ?? 'null')
    return v && typeof v.base === 'number' && typeof v.dirty === 'boolean' ? v : null
  } catch {
    return null
  }
}
function writeMeta(id: string, m: { base: number; dirty: boolean }) {
  try {
    localStorage.setItem(metaKey(id), JSON.stringify(m))
  } catch {
    /* storage unavailable: server sync still works while the page is open */
  }
}
