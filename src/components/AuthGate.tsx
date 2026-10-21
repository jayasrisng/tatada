import {ChangePassword} from './ChangePassword'
import {EmailSignIn} from './EmailSignIn'
import {AccountRecovery} from './AccountRecovery'
import {SharedTripView} from './SharedTripView'
import {useRoute} from '../state/ui'
import {OfflineTrip,loadSelectedPack} from './OfflineTrip'
import { beginSignIn, apiUrl, hasHostedApi, browserOnly } from '../config'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppState } from '../types'
import { api, useServer } from '../state/server'
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
  const route=useRoute()
  const [preview, setPreview] = useState(false)
  const server = useServer()
  const { info } = server
  const [loaded, setLoaded] = useState<{ accountId: string; version: number; state?: AppState; gen: number } | null>(null)
  const [lastSyncAt,setLastSyncAt]=useState<number|undefined>()
  const [syncNote, setSyncNote] = useState<string | null>(null)
  const version = useRef(0)
  const lastSynced = useRef<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const needsLoad=useRef(false),syncEpoch=useRef(0)
  const [loadRevision,setLoadRevision]=useState(0)
  const latest = useRef<AppState | null>(null), inFlight = useRef(false), blocked = useRef(false)
  const [conflict,setConflict] = useState<{version:number;state:AppState}|null>(null)
  const [retry,setRetry] = useState(0)
  const accountId = info.authenticated ? info.account?.id : undefined

  useEffect(() => {
    if (!accountId) return setLoaded(null)
    syncEpoch.current++;needsLoad.current=false;blocked.current=true;inFlight.current=false;latest.current=null;setConflict(null)
    let live = true
    server
      .loadWorkspace()
      .then((w) => {
        if (!live) return
        needsLoad.current=false;blocked.current=false;setSyncNote(null)
        version.current = w.version
        // Unsynced local edits win if the server hasn't moved on since they were made.
        const meta = readMeta(accountId)
        const local = loadState(() => window.localStorage, accountKey(accountId), emptyState)
        const keepLocal = meta?.dirty && !local.warning
        if(keepLocal&&meta.base!==w.version&&isAppState(w.state)){blocked.current=true;setConflict({version:w.version,state:w.state});setSyncNote('Both copies changed. Choose which copy to keep; your local edits are retained.')}
        if(keepLocal)latest.current=local.state
        const syncedAt=keepLocal?meta?.syncedAt:isAppState(w.state)?Date.now():undefined
        setLastSyncAt(syncedAt)
        if(!keepLocal&&isAppState(w.state))writeMeta(accountId,{base:w.version,dirty:false,syncedAt})
        let state = keepLocal ? local.state : isAppState(w.state) ? w.state : undefined
        // Single-owner local mode: open straight into Jayasri's canvas, keeping any progress on this browser.
        if (info.account?.kind === 'owner') state = state ?? (localStorage.getItem(accountKey(accountId)+':deleted')?emptyState():bestLocalCopy()) ?? emptyState()
        lastSynced.current = keepLocal ? null : state ? JSON.stringify(state) : null
        setLoaded(l=>({ accountId, version: w.version, state, gen: l?.accountId===accountId?l.gen+1:0 }))
      })
      .catch(() => {if(live){needsLoad.current=true;version.current=readMeta(accountId)?.base??0;const local=loadState(()=>localStorage,accountKey(accountId),emptyState);blocked.current=true;setSyncNote('Could not load the server copy. Local edits are retained. Reconnect before syncing.');setLoaded({accountId,version:readMeta(accountId)?.base??0,state:local.state,gen:0})}})
    return () => {
      live = false;syncEpoch.current++;clearTimeout(timer.current)
    }
  }, [accountId,loadRevision])

  useEffect(()=>{const retrySync=()=>setRetry(n=>n+1);window.addEventListener('online',retrySync);const t=setInterval(retrySync,15000);return()=>{window.removeEventListener('online',retrySync);clearInterval(t);clearTimeout(timer.current)}},[])

  // Debounced, serialized push. Conflicting copies require an explicit choice.
  const onChange = useCallback(
    (state: AppState) => {
      if (!accountId) return
      latest.current=state
      const json = JSON.stringify(state)
      if (json === lastSynced.current) return
      writeMeta(accountId, { base: version.current, dirty: true })
      if(blocked.current)return
      const epoch=syncEpoch.current
      clearTimeout(timer.current)
      timer.current = window.setTimeout(async () => {
        if(epoch!==syncEpoch.current||inFlight.current||blocked.current)return
        inFlight.current=true
        try {
          const r = await server.saveWorkspace(version.current, state)
          if(epoch!==syncEpoch.current)return
          if (r.ok) {
            version.current = r.version
            lastSynced.current = json
            const dirty=JSON.stringify(latest.current)!==json
            const syncedAt=Date.now();setLastSyncAt(syncedAt)
            writeMeta(accountId, { base: r.version, dirty, syncedAt })
            setSyncNote(dirty?'New edits saved on device; waiting to sync.':null)
          } else if (isAppState(r.state)) {
            blocked.current=true
            try {localStorage.setItem(`${accountKey(accountId)}:recovery`,JSON.stringify(latest.current??state))} catch { /* existing cache retained */ }
            setConflict({version:r.version,state:r.state})
            setSyncNote('This workspace changed elsewhere. Your edits are kept here. Review both copies before choosing.')
          } else {blocked.current=true;setSyncNote('The server copy is invalid. Your on-device edits are retained; export them before recovering the server.')}
        } catch {
          if(epoch!==syncEpoch.current)return
          setSyncNote('Saved on this device. It will sync when the Tatada server is reachable.')
        } finally {if(epoch===syncEpoch.current)inFlight.current=false}
      }, 800)
    },
    [accountId],
  )

  useEffect(()=>{if(needsLoad.current&&accountId)setLoadRevision(n=>n+1);else if(latest.current&&!blocked.current)onChange(latest.current)},[retry,onChange])

  if(route[0]==='shared'&&route[1])return <SharedTripView token={route[1]}/>
  const offlinePack = loadSelectedPack()
  if (offlinePack && (!loaded||!accountId) && (!navigator.onLine || (!browserOnly && info.checked && !info.available))) return <OfflineTrip pack={offlinePack}/>
  if (browserOnly) return <BrowserWorkspace />

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

  if(info.passwordChangeRequired)return <ChangePassword/>
  if (!info.authenticated || !accountId) return <SignIn onDemo={() => setPreview(true)} />
  if (!loaded || loaded.accountId !== accountId) return <Splash />

  const workspace: Workspace = { kind: info.account?.kind ?? 'demo', storageKey: accountKey(accountId), lastSyncedAt:lastSyncAt, onChange, suspendSync:async()=>{const previous=blocked.current;blocked.current=true;clearTimeout(timer.current);const end=Date.now()+20000;while(inFlight.current){if(Date.now()>end){blocked.current=previous;throw new Error('A workspace save is still finishing. Try deletion again.')}await new Promise(r=>setTimeout(r,100))}return()=>{blocked.current=previous;setRetry(n=>n+1)}} }
  workspace.deleteTrip=async(tripId)=>{
    if(blocked.current||conflict)throw new Error('Resolve workspace sync or conflicts before deleting a trip.')
    const epoch=syncEpoch.current,resume=await workspace.suspendSync!()
    try{
      const current=latest.current??loaded.state
      if(!current)throw new Error('Reload the saved workspace first.')
      if(JSON.stringify(current)!==lastSynced.current){const saved=await server.saveWorkspace(version.current,current);if(!saved.ok)throw new Error('Workspace changed elsewhere. Reload and review before deleting.');version.current=saved.version}
      if(epoch!==syncEpoch.current)throw new Error('Account changed. Reload before deleting.')
      const result=await api<{state:AppState;version:number}>('/api/trips/delete',{method:'POST',json:{tripId,confirm:'DELETE',baseVersion:version.current}})
      if(epoch!==syncEpoch.current)throw new Error('Account changed while deletion completed. Reload to see its result.')
      version.current=result.version;lastSynced.current=JSON.stringify(result.state);latest.current=result.state
      saveState(result.state,()=>localStorage,accountKey(accountId));writeMeta(accountId,{base:result.version,dirty:false,syncedAt:Date.now()})
      setLoaded(l=>l?.accountId===accountId?{...l,state:result.state,gen:l.gen+1}:l)
      return result.state
    }finally{if(epoch===syncEpoch.current)resume()}
  }
  return (
    <>{conflict&&<section className="mode-banner" role="alertdialog" aria-label="Resolve workspace conflict"><p>Your device and server have different saved copies. Neither will be overwritten until you choose.</p><div className="ac-buttons"><button className="linkbtn" onClick={()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(conflict.state)],{type:'application/json'}));a.download='tatada-server-copy.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}}>download server copy</button><button className="linkbtn" onClick={()=>{version.current=conflict.version;blocked.current=false;setConflict(null);if(latest.current)onChange(latest.current)}}>keep this device’s copy</button><button className="linkbtn" onClick={()=>{if(latest.current)try{localStorage.setItem(`${accountKey(accountId)}:recovery`,JSON.stringify(latest.current))}catch{return setSyncNote('Could not preserve local recovery. Export it before choosing the server copy.')};version.current=conflict.version;lastSynced.current=JSON.stringify(conflict.state);latest.current=conflict.state;saveState(conflict.state,()=>localStorage,accountKey(accountId));writeMeta(accountId,{base:conflict.version,dirty:false,syncedAt:Date.now()});setLastSyncAt(Date.now());blocked.current=false;setLoaded(l=>l&&{...l,state:conflict.state,gen:l.gen+1});setConflict(null);setSyncNote('Server copy loaded. Your previous edits are in profile recovery.') }}>use server copy</button></div></section>}<Mount
      key={`${accountId}:${loaded.gen}`}
      workspace={workspace}
      initialState={loaded.state}
      banner={syncNote??(info.account?.kind === 'demo' ? 'Demo mode · mock Fo · not a real account' : undefined)}
    /></>
  )
}

function BrowserWorkspace() {
  const [initial] = useState(() => loadState(() => window.localStorage, `${STORAGE_KEY}:preview`, () => localStorage.getItem(`${STORAGE_KEY}:preview:deleted`)?emptyState():bestLocalCopy() ?? seed()))
  return <Mount workspace={{ kind: 'local-demo', storageKey: `${STORAGE_KEY}:preview` }} initialState={personalize(initial.state)} initialWarning={initial.warning} banner="Saved in this browser · sample trips · Fo and sign-in paused" />
}

function Mount({ workspace, initialState, initialWarning, banner }: { workspace: Workspace; initialState?: AppState; initialWarning?: string | null; banner?: string }) {
  return (
    <StoreProvider workspace={workspace} initialState={initialState} initialWarning={initialWarning}>
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
const AUTH_REASONS:Record<string,string>={exchange_expired:'This sign-in expired. Start a new sign-in below.',exchange_used:'This sign-in was already used. Start a new sign-in below.',exchange_browser_mismatch:'This sign-in belongs to another browser. Start a new sign-in in this browser.',exchange_invalid:'This sign-in is no longer valid. Start again below.',browser_storage:'Allow site storage in this browser, then start a new sign-in.'}

function SignIn({ onDemo }: { onDemo: () => void }) {
  const {info}=useServer()
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
              {AUTH_REASONS[reason??'']??AUTH_MESSAGES[auth]??AUTH_MESSAGES.error}
            </p>
          )}
          {new URLSearchParams(location.hash.split('?')[1]??'').get('account_deleted')==='1'&&<p role="status">Active Tatada account data was deleted. {new URLSearchParams(location.hash.split('?')[1]??'').get('identity_cleanup')==='pending'?'Identity cleanup is queued and may need operator follow-up. ':''}Other-device copies and backups have separate removal controls.</p>}
          {new URLSearchParams(location.hash.split('?')[1]??'').get('password_changed')==='1'&&<p role="status">Password changed. Sign in with your new password.</p>}
          {info.authMethod==='supabase'?<EmailSignIn/>:<a className="btn btn-solid signin-btn" href={apiUrl('/api/auth/wajo/start')} onClick={beginSignIn}>
            <Doodle name="arrow" size={20} />
            <span>Continue with Wajo</span>
          </a>}
          <button className="linkbtn" onClick={onDemo}>explore a sample trip first</button>{info.authMethod!=='supabase'&&<AccountRecovery/>}
          <p className="small dim">{info.authMethod==='supabase'?'Sign in with the same invited email account on each device. To migrate an older Wajo workspace, unlock Account security and link its saved recovery key before adding new work.':<>Returning on a new device? Restore your existing workspace before reconnecting if Wajo does not provide a verified account identity. A new connection can create a separate workspace; Tatada never merges accounts by a typed email.</>}</p>
          <p className="dim small signin-fine">
            {info.authMethod==='supabase'?'Tatada uses administrator-provisioned email and password accounts. Wajo is an optional connection after sign-in.':'Tatada signs you in with your Wajo account. Your Wajo password and tokens never reach this page.'}
          </p>
        </div>
      </main>
    </div>
  )
}


/** Sync bookkeeping per account: the server version local edits are based on, and whether they're unsynced. */
const metaKey = (id: string) => `${accountKey(id)}:sync`
function readMeta(id: string): { base: number; dirty: boolean; syncedAt?: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(metaKey(id)) ?? 'null')
    return v && typeof v.base === 'number' && typeof v.dirty === 'boolean' ? v : null
  } catch {
    return null
  }
}
function writeMeta(id: string, m: { base: number; dirty: boolean; syncedAt?:number }) {
  try {
    localStorage.setItem(metaKey(id), JSON.stringify({...m,syncedAt:m.syncedAt??readMeta(id)?.syncedAt}))
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
      if (![STORAGE_KEY,`${STORAGE_KEY}:preview`].includes(k)) continue
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
