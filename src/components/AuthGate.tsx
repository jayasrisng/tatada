import { beginSignIn, apiUrl, hasHostedApi } from '../config'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppState } from '../types'
import { useServer } from '../state/server'
import { StoreProvider, type Workspace } from '../state/store'
import { UIProvider, hashQuery } from '../state/ui'
import { accountKey, isAppState, loadState, saveState, STORAGE_KEY } from '../state/persistence'
import { LISBON_ITINERARY, WARDROBE, emptyState, seed } from '../data/seed'
import { App } from '../App'
import { Doodle, MagicBuddy } from './Doodle'

/*
 * Who's using Tatada decides which workspace loads:
 *   - live server, signed in with Wajo   → that account's workspace (server is the source of truth)
 *   - live server, not signed in         → Continue with Wajo (the only way in)
 *   - mock server                        → a labeled demo account
 *   - single-owner local server          → the owner's workspace, no sign-in
 *   - no server                          → a labeled simulated workspace in this browser
 */
export function AuthGate() {
  const [preview, setPreview] = useState(false)
  const server = useServer()
  const { info } = server
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
        let state = keepLocal ? local.state : isAppState(w.state) ? w.state : undefined
        // Single-owner local mode: open straight into Jayasri's canvas, keeping any progress on this browser.
        if (info.account?.kind === 'owner') state = personalize(state ?? bestLocalCopy() ?? seed())
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

  if (preview) return (
    <>
      <div className="mode-banner"><button className="linkbtn" onClick={() => setPreview(false)}>back to live Tatada</button></div>
      <Mount workspace={{ kind: 'local-demo', storageKey: `${STORAGE_KEY}:preview` }} initialState={loadState(() => window.localStorage, `${STORAGE_KEY}:preview`, seed).state} banner="Interactive preview · sample data · no real messages or bookings" />
    </>
  )
  if (!info.checked) return <Splash />

  if (!info.available && hasHostedApi) return (
    <div className="frame"><main className="app chromeless"><div className="screen center">
      <MagicBuddy size={84} /><h1 className="logo big">tatada</h1>
      <p>The live connection is unavailable right now.</p>
      <p className="dim">You can explore a sample trip while it reconnects. Preview actions are simulated.</p>
      <button className="btn btn-solid" onClick={() => setPreview(true)}>explore a sample trip</button>
      <button className="linkbtn" onClick={() => void server.refresh()}>try live connection again</button>
    </div></main></div>
  )
  if (!info.available) {
    // No server: still open directly, clearly labeled, with nothing real able to happen.
    return <Mount workspace={{ kind: 'local-demo', storageKey: STORAGE_KEY }} initialState={personalize(bestLocalCopy() ?? seed())} banner="Tatada server offline · simulated mode · nothing real can happen" />
  }

  if (!info.authenticated || !accountId) return <SignIn onDemo={() => setPreview(true)} />
  if (!loaded || loaded.accountId !== accountId) return <Splash />

  const workspace: Workspace = { kind: info.account?.kind ?? 'demo', storageKey: accountKey(accountId), onChange }
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

function SignIn({ onDemo }: { onDemo: () => void }) {
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
          <a className="btn btn-solid signin-btn" href={apiUrl('/api/auth/wajo/start')} onClick={beginSignIn}>
            <Doodle name="arrow" size={20} />
            <span>Continue with Wajo</span>
          </a>
          <button className="linkbtn" onClick={onDemo}>explore a sample trip first</button>
          <p className="dim small signin-fine">
            Tatada signs you in with your Wajo account. Fo only acts for you after you approve each request. Your Wajo password and tokens never reach this page.
          </p>
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

/** The single local profile. Existing names are kept unless they're blank or the old sample name. */
const OWNER_NAME = 'Jayasri'
function personalize(s: AppState): AppState {
  const name = !s.profile.name.trim() || s.profile.name === 'Ana' ? OWNER_NAME : s.profile.name
  // Bring older copies up to date once: Jayasri's closet and the Lisbon starter itinerary.
  const trips = s.trips.map((t) => (t.id === 'lisbon' && t.demoScenario === 'lisbon' && !t.itinerary ? { ...t, itinerary: LISBON_ITINERARY } : t))
  return { ...s, trips, wardrobe: s.wardrobe ?? WARDROBE, looks: s.looks ?? [], onboarded: true, profile: { ...s.profile, name } }
}

/** The richest valid Tatada copy saved in this browser (earlier demo or account caches). */
function bestLocalCopy(): AppState | undefined {
  let best: AppState | undefined
  let score = -1
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? ''
      if (!k.startsWith(STORAGE_KEY) || /:(recovery|sync)$/.test(k)) continue
      const v = JSON.parse(localStorage.getItem(k) ?? 'null')
      if (!isAppState(v)) continue
      const n = v.items.length + v.trips.length * 5 + v.chat.length + v.trips.reduce((m, t) => m + t.memories.length, 0)
      if (n > score) (best = v), (score = n)
    }
  } catch {
    /* storage unavailable */
  }
  return best
}
