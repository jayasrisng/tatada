import {initializeAuth,signOutAuth} from './supabase-auth'
import {accountKey} from './persistence'
import {OFFLINE_SELECTED} from '../offline/pack'
import {fetchWithBackoff} from './retry'
import {redeemOnce} from './login'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { EmailDraft, Profile, Trip } from '../types'
import { apiUrl, usesBearer, sessionHeaders, saveSession, loginBinding, clearLoginAttempt, browserOnly } from '../config'
import { sharedData, stayBooking } from '../magic/stay'

/*
 * Client for the Tatada server. Server actions are authoritative and live only
 * on the server: the browser keeps their ids (in chat) and polls for status,
 * so a reload or a server restart picks up where things were.
 */

export type ServerStatus =
  | 'proposed' | 'approved' | 'sending' | 'send_uncertain' | 'waiting' | 'needs_input' | 'answering'
  | 'verifying' | 'verified' | 'unverified' | 'failed' | 'timeout' | 'cancelled'

export interface ServerAction {
  id: string
  provider: 'live' | 'mock'
  draft: { tripId: string; checklistItemId?: string; intent: string; to: string; toName: string; subject: string; body: string; transferQuote: boolean; shared: string[] }
  ref: string
  foMessage: string
  contentHash: string
  status: ServerStatus
  progress: { at: number; text: string }[]
  question?: string
  answers: { at: number; text: string }[]
  error?: string
  retryable?: boolean
  conversationId?: string
  result?: {
    outcome: string
    summary: string
    evidence: { kind: string; detail: string; messageId?: string }[]
    transferQuote?: string
    itemDone: boolean
    itemNote: string
  }
}

export const ACTIVE: ServerStatus[] = ['approved', 'sending', 'send_uncertain', 'waiting', 'answering', 'verifying']

export interface ServerInfo {
  authMethod?:'supabase'|'legacy'
  beta?:boolean
  betaOwner?:boolean
  version?:string
  prototype?:boolean
  passwordChangeRequired?:boolean
  /** False until the first status check finishes. */
  checked: boolean
  available: boolean
  provider?: 'live' | 'mock'
  demo?: boolean
  authenticated?: boolean
  owner?: boolean
  account?: { id: string; kind: 'wajo' | 'demo' | 'owner' | 'connected'; identitySource?: string; since: number }
  foAuth?: string
  foConnected?: boolean
  liveRecipients?: string[]
}

export class ApiError extends Error {
  status: number
  code?:string
  constructor(status: number, message: string, code?:string) {
    super(message)
    this.status = status
    this.code=code
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  if (browserOnly) throw new Error('Fo is paused. This workspace saves in your browser.')
  const res = await fetchWithBackoff(apiUrl(path), {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(15000),
    credentials: usesBearer ? 'omit' : 'include',
    headers: { ...sessionHeaders(), ...(init.method && init.method !== 'GET' ? { 'x-tatada': '1' } : {}), ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
  }, path)
  const body = await res.json().catch(() => ({}))
  if(res.status===401&&path!=='/api/session')window.dispatchEvent(new Event('tatada-auth-changed'))
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Server error (${res.status})`,body.code)
  return body as T
}

export function draftPayload(email: EmailDraft, trip: Trip, profile: Profile, checklistItemId?: string) {
  return {
    intent: email.intent,
    tripId: trip.id,
    checklistItemId,
    to: email.to,
    toName: email.toName,
    subject: email.subject,
    body: email.body,
    transferQuote: email.transferQuote,
    shared: sharedData(trip, profile, stayBooking(trip)?.ref),
  }
}

const newKey = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('')

interface Ctx {
  info: ServerInfo
  logout: (everywhere?: boolean) => Promise<void>
  loadWorkspace: () => Promise<{ version: number; state: unknown }>
  saveWorkspace: (baseVersion: number, state: unknown) => Promise<{ ok: true; version: number } | { ok: false; version: number; state: unknown }>
  actions: Record<string, ServerAction>
  refresh: () => Promise<void>
  create: (payload: ReturnType<typeof draftPayload>) => Promise<ServerAction>
  edit: (id: string, patch: Partial<ServerAction['draft']>) => Promise<void>
  approve: (a: ServerAction, key: string) => Promise<void>
  command: (id: string, verb: 'answer' | 'cancel' | 'retry' | 'check', body?: unknown) => Promise<void>
  track: (ids: string[]) => void
  newKey: () => string
}

const C = createContext<Ctx | null>(null)

export function ServerProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<ServerInfo>({ checked: false, available: false })
  const [actions, setActions] = useState<Record<string, ServerAction>>({})
  const tracked = useRef(new Set<string>())
  const refreshing = useRef(false),refreshQueued=useRef(false),authRevision=useRef(0)

  const put = (list: ServerAction[]) => setActions((prev) => ({ ...prev, ...Object.fromEntries(list.map((a) => [a.id, a])) }))

  const refresh:()=>Promise<void> = useCallback(async () => {
    if (browserOnly) return setInfo({ checked: true, available: false })
    if (refreshing.current){refreshQueued.current=true;return}
    refreshing.current = true
    const revision=authRevision.current
    try {
      await initializeAuth()
      const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
      const code = params.get('auth_exchange')
      if (usesBearer && code) {
        const attempt=params.get('auth_attempt')??undefined
        try{
          const result=await redeemOnce(code,()=>api<{sessionToken:string}>('/api/auth/exchange',{method:'POST',json:{code,binding:loginBinding(attempt)}}))
          saveSession(result.sessionToken);clearLoginAttempt(attempt)
          history.replaceState(null,'',`${location.pathname}${location.search}#/`)
        }catch(e){
          if(!(e instanceof ApiError)||e.status!==401)throw e
          const reason=['exchange_expired','exchange_used','exchange_browser_mismatch'].includes(e.code??'')?e.code:'exchange_invalid'
          history.replaceState(null,'',`${location.pathname}${location.search}#/welcome?auth=error&reason=${reason}`)
          // An invalid callback does not revoke a separately valid existing session.
        }
      }
      const s = await api<Omit<ServerInfo, 'available' | 'checked'> & { sessionToken?: string }>('/api/session', { method: 'POST' })
      if(revision!==authRevision.current)return
      if (s.sessionToken) saveSession(s.sessionToken)
      setInfo({ checked: true, available: true, ...s })
    } catch {
      if(revision===authRevision.current)setInfo({ checked: true, available: false })
    } finally { refreshing.current = false;if(refreshQueued.current){refreshQueued.current=false;setTimeout(()=>void refresh(),0)} }
  }, [])

  useEffect(()=>{const changed=()=>{authRevision.current++;void refresh()};window.addEventListener('tatada-auth-changed',changed);return()=>window.removeEventListener('tatada-auth-changed',changed)},[refresh])
  useEffect(() => {
    void refresh()
  }, [refresh])

  const poll = useCallback(async () => {
    const ids = [...tracked.current]
    if (!ids.length) return
    try {
      put((await api<{ actions: ServerAction[] }>(`/api/actions?ids=${ids.join(',')}`)).actions)
    } catch {
      /* transient: try again next tick */
    }
  }, [])

  // Poll quickly while anything is in flight, slowly otherwise.
  const anyActive = Object.values(actions).some((a) => ACTIVE.includes(a.status))
  useEffect(() => {
    if (!info.available || !info.authenticated) return
    void poll()
    const t = window.setInterval(poll, anyActive ? 1200 : 8000)
    return () => clearInterval(t)
  }, [info.available, info.authenticated, anyActive, poll])

  const track = useCallback((ids: string[]) => {
    let added = false
    for (const id of ids) if (!tracked.current.has(id)) (tracked.current.add(id), (added = true))
    if (added) void poll()
  }, [poll])

  const value: Ctx = {
    info,
    logout: async (everywhere = false) => {
      await api('/api/auth/logout', { method: 'POST', json: { everywhere } })
      if(info.account?.id)try{const prefix=`${accountKey(info.account.id)}:offline:`;for(const k of Object.keys(localStorage))if(k.startsWith(prefix))localStorage.removeItem(k);if(localStorage.getItem(OFFLINE_SELECTED)?.startsWith(prefix))localStorage.removeItem(OFFLINE_SELECTED)}catch{/* Device storage may be unavailable. */}
      authRevision.current++;setInfo(i=>({...i,authenticated:false,account:undefined,foConnected:false}));saveSession()
      try{await signOutAuth(everywhere)}finally{tracked.current.clear();setActions({});await refresh()}
    },
    loadWorkspace: () => api<{ version: number; state: unknown }>('/api/workspace'),
    saveWorkspace: async (baseVersion, state) => {
      const res = await fetch(apiUrl('/api/workspace'), {
        method: 'PUT',
        credentials: usesBearer ? 'omit' : 'include',
        headers: { ...sessionHeaders(), 'x-tatada': '1', 'content-type': 'application/json' },
        body: JSON.stringify({ baseVersion, state }),
        signal:AbortSignal.timeout(15000),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 409) return { ok: false, version: body.version, state: body.state }
      if(res.status===401)window.dispatchEvent(new Event('tatada-auth-changed'))
      if (!res.ok) throw new ApiError(res.status, body.error ?? 'Could not save to the server')
      return { ok: true, version: body.version }
    },
    actions,
    refresh,
    newKey,
    track,
    create: async (payload) => {
      const { action } = await api<{ action: ServerAction }>('/api/actions', { method: 'POST', json: payload })
      tracked.current.add(action.id)
      put([action])
      return action
    },
    edit: async (id, patch) => {
      const cur = actions[id]
      const { action } = await api<{ action: ServerAction }>(`/api/actions/${id}`, { method: 'PATCH', json: { ...cur.draft, ...patch } })
      put([action])
    },
    approve: async (a, key) => {
      const { action } = await api<{ action: ServerAction }>(`/api/actions/${a.id}/approve`, { method: 'POST', json: { contentHash: a.contentHash, idempotencyKey: key } })
      put([action])
    },
    command: async (id, verb, body) => {
      const { action } = await api<{ action: ServerAction }>(`/api/actions/${id}/${verb}`, { method: 'POST', json: body ?? {} })
      put([action])
    },
  }
  return <C.Provider value={value}>{children}</C.Provider>
}

export function useServer() {
  const c = useContext(C)
  if (!c) throw new Error('useServer outside provider')
  return c
}
