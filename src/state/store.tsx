import { createContext, useContext, useEffect, useReducer, useState, type ReactNode } from 'react'
import type { AppState, EmailDraft, FoAction, StayDetails, Trip } from '../types'
import { emptyState, seed } from '../data/seed'
import { think } from '../magic/engine'

import { loadState, saveState } from './persistence'
import { reducer, type Act } from './reducer'
import { uid } from './id'
export { uid } from './id'

interface Store {
  state: AppState
  storageWarning: string | null
  dispatch: React.Dispatch<Act>
  ask: (prompt: string, tripId?: string, checklistItemId?: string, details?: StayDetails, echo?: boolean, viaServer?: ViaServer) => Promise<void>
  resetDemo: (fresh?: boolean) => void
  /** Which kind of workspace this is: a demo, or a signed-in Wajo account. */
  workspace: Workspace
}

export interface Workspace {
  kind: 'local-demo' | 'demo' | 'wajo' | 'owner' | 'connected'
  storageKey: string
  deleteTrip?: (tripId: string) => Promise<AppState>
  suspendSync?: () => Promise<() => void>
  lastSyncedAt?: number
  /** Called after each change is saved locally (e.g. to sync to the server). */
  onChange?: (state: AppState) => void
}

/** Hands a drafted email to the Tatada server; resolves to the server action id. */
export type ViaServer = (email: EmailDraft, trip: Trip, checklistItemId?: string) => Promise<string>

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children, workspace, initialState, initialWarning }: { children: ReactNode; workspace: Workspace; initialState?: AppState; initialWarning?: string | null }) {
  const fresh = (workspace.kind === 'wajo' || workspace.kind === 'connected') ? emptyState : seed
  const [initial] = useState(() =>
    initialState ? { state: initialState, warning: initialWarning ?? null } : loadState(() => window.localStorage, workspace.storageKey, fresh),
  )
  const [state, dispatch] = useReducer(reducer, initial.state)
  const [storageWarning, setStorageWarning] = useState(initial.warning)

  useEffect(() => {
    if (!saveState(state, () => window.localStorage, workspace.storageKey)) {
      setStorageWarning('Changes are only in memory because browser storage could not save them. Keep this page open to avoid losing your work.')
    }
    workspace.onChange?.(state)
  }, [state])

  // Drives simulated Fo actions forward, one step at a time.
  useEffect(() => {
    const timers = state.actions
      .filter((a) => a.mode === 'simulated' && (a.status === 'running' || a.status === 'done'))
      .map((a) => window.setTimeout(() => dispatch({ type: 'tick', id: a.id }), a.status === 'done' ? 1100 : 1400))
    return () => timers.forEach(clearTimeout)
  }, [state.actions])

  const ask = async (prompt: string, tripId?: string, checklistItemId?: string, details?: StayDetails, echo = true, viaServer?: ViaServer) => {
    const trip = state.trips.find((t) => t.id === tripId)
    const decision = state.decisions?.find((d) => d.tripId === tripId && d.topic === 'early_checkin')
    const reply = think(prompt, trip, checklistItemId, { profile: state.profile, details, items: state.items, decision })
    if (reply.action?.email && trip && viaServer) {
      const mine = echo ? [{ id: uid(), from: 'me' as const, text: prompt }] : []
      dispatch({ type: 'chat', messages: mine })
      echo = false
      try {
        const serverActionId = await viaServer(reply.action.email, trip, reply.action.checklistItemId)
        dispatch({ type: 'chat', messages: [{ id: uid(), from: 'tatada', text: reply.text, serverActionId }] })
        return
      } catch (e) {
        dispatch({type:'chat',messages:[{id:uid(),from:'tatada',text:`This request was not prepared: ${(e as Error).message}. Retry after checking the connection. No simulated action was substituted.`}]})
        return
      }
    }
    const action: FoAction | undefined = reply.action && {
      ...reply.action,
      id: uid(),
      createdAt: Date.now(),
      status: 'proposed',
      cursor: 0,
      log: [],
      answers: [],
      mode: 'simulated',
    }
    const items = reply.addItems?.map((i) => ({ ...i, id: uid() }))
    dispatch({
      type: 'chat',
      messages: [
        ...(echo ? [{ id: uid(), from: 'me' as const, text: prompt }] : []),
        { id: uid(), from: 'tatada', text: reply.text, bullets: reply.bullets, actionId: action?.id, addedItems: items?.length ? items.map((i) => i.text) : undefined, form: reply.form },
      ],
      action,
      items,
    })
  }

  const resetDemo = (again = false) => {
    const s = fresh()
    dispatch({ type: 'reset', state: again ? { ...s, onboarded: false } : s })
  }

  return <Ctx.Provider value={{ state, storageWarning, dispatch, ask, resetDemo, workspace }}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside provider')
  return s
}
