import {BetaFeedback} from './components/account/Beta'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { useStore } from './state/store'
import { go, useRoute, useUI } from './state/ui'
import { useServer } from './state/server'
import { ChalkDefs } from './components/layout/Doodle'
import { TabBar } from './components/layout/TabBar'
import { MagicSheet } from './components/assistant/MagicSheet'
import { GuidedTour } from './components/layout/GuidedTour'
import { Home } from './screens/Home'
import { Trips } from './screens/Trips'
import { TripWorkspace } from './screens/TripWorkspace'
import { NewTrip } from './screens/NewTrip'
import { Tasks } from './screens/Tasks'
import { Style } from './screens/Style'
import { Welcome } from './screens/Welcome'

import { fmtRange } from './components/layout/ui'
import { Arrival } from './components/layout/Arrival'
const PrintView = lazy(() => import('./screens/PrintView').then((m) => ({ default: m.PrintView })))

const Policies = lazy(() => import('./screens/Policies').then(m => ({ default: m.Policies })))

export function App() {
  const route = useRoute()
  const [arriving, setArriving] = useState(() => route.length === 0)
  const finishArrival = useCallback(() => setArriving(false), [])
  const { state, storageWarning } = useStore()
  const { magic, focusTripId, setFocusTrip } = useUI()
  const [root, id, tab, sub] = route
  const [touring, setTouring] = useState(false)
  useEffect(() => { if (root === 'tour') { setTouring(true); go('/') } }, [root])
  useEffect(() => {
    if (focusTripId && root === 'new') { setFocusTrip(undefined); return }
    if (focusTripId && root === 'trip' && id !== focusTripId && state.trips.some(t => t.id === id)) setFocusTrip(id)
  }, [root, id, focusTripId, state.trips, setFocusTrip])
  useServerSync()

  useEffect(() => {
    if (!state.onboarded && root !== 'welcome' && root !== 'policies') go('/welcome')
  }, [state.onboarded, root])

  let screen
  switch (root) {
    case undefined:
      screen = <Home />
      break
    case 'tour':
      screen = <Home />
      break
    case 'trips':
      screen = <Trips key={id ?? 'trips'} initial={id === 'map' ? 'history' : 'trips'} />
      break
    case 'trip':
      screen = tab === 'print' ? <Suspense fallback={<p>Opening print…</p>}><PrintView id={id} doc={sub} /></Suspense> : <TripWorkspace key={`${id}:${tab}`} id={id} tab={tab} />
      break
    case 'new':
      screen = <NewTrip />
      break
    case 'tasks':
      screen = <Tasks />
      break
    case 'style':
      screen = <Style />
      break
    case 'policies':
      screen = <Suspense fallback={<p>Opening policies…</p>}><Policies section={id} /></Suspense>
      break
    case 'welcome':
      screen = <Welcome />
      break
    default:
      screen = <Home />
  }

  const chromeless = root === 'tour' || root === 'policies' || root === 'welcome' || root === 'new' || tab === 'print'
  const current = root === 'trip' ? 'trips' : (root ?? '')

  return (
    <div className={`frame ${focusTripId ? 'trip-shell' : ''}`}>
      <ChalkDefs />
      {focusTripId && <header className="trip-shell-bar" aria-label="Current trip" inert={!!magic || arriving}><span>{state.trips.find(t=>t.id===focusTripId)?.destination}<small>{(() => {const t=state.trips.find(t=>t.id===focusTripId);return t ? fmtRange(t.start,t.end) : ''})()}</small></span><button className="linkbtn" onClick={()=>{setFocusTrip(undefined); go('/')}}>My World</button></header>}
      {arriving && <Arrival name={state.profile.name} onDone={finishArrival} />}
      {storageWarning && <p className="storage-warning" role="status">{storageWarning}</p>}
      {/* While Magic is open, the rest of the app is inert: no focus, no clicks, hidden from screen readers. */}
      <main className={`app ${chromeless ? 'chromeless' : ''}`} inert={!!magic || arriving}>{screen}<BetaFeedback/></main>
      {(!chromeless || !!focusTripId) && (
        <div inert={!!magic || arriving}>
          <TabBar current={current} tripId={root === 'trip' ? id : undefined} />
        </div>
      )}
      <MagicSheet />
      {touring && !arriving && <GuidedTour onClose={() => setTouring(false)} />}
    </div>
  )
}

/** Tracks server actions referenced in chat and copies verified outcomes onto their own trip's task. */
function useServerSync() {
  const { state, dispatch, workspace } = useStore()
  const { actions, track } = useServer()
  const ids = state.chat.map((m) => m.serverActionId).filter((x): x is string => !!x)
  const key = ids.join(',')
  useEffect(() => {
    if (!workspace.storageKey.endsWith(':preview')) track(ids)
  }, [key])

  useEffect(() => {
    if (workspace.storageKey.endsWith(':preview')) return
    for (const a of Object.values(actions)) {
      const r = a.result
      const itemId = a.draft.checklistItemId
      if (a.status !== 'verified' || !r || !itemId) continue
      const item = state.items.find((i) => i.id === itemId)
      if (!item || item.tripId !== a.draft.tripId) continue
      if (item.actionId === a.id && item.note === r.itemNote && (item.done || !r.itemDone)) continue
      dispatch({ type: 'applyServerOutcome', tripId: a.draft.tripId, itemId, actionId: a.id, done: r.itemDone, note: r.itemNote })
    }
    // Validate step: Fo results feed the trip's early check-in decision record.
    for (const a of Object.values(actions)) {
      if (a.draft.intent !== 'early_checkin' || (a.status !== 'verified' && a.status !== 'unverified')) continue
      const r = a.result
      dispatch({
        type: 'recordValidation',
        tripId: a.draft.tripId,
        validation: {
          actionId: a.id,
          provider: a.provider,
          status: a.status,
          outcome: r?.outcome,
          summary: r?.summary ?? a.error ?? 'No proof found.',
          evidence: (r?.evidence ?? []).map((e) => (e.kind === 'email_sent' ? `Send record: ${e.detail}${e.messageId ? ` (${e.messageId})` : ''}` : `Reply: "${e.detail}"`)),
          at: a.progress.at(-1)?.at ?? Date.now(),
        },
      })
    }
  }, [actions, state.items])
}
