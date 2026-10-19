import type { AppState, ArchivedAction } from '../types'
import { isAppState } from './persistence'

/*
 * Export / import. One versioned JSON file with the profile, trips, tasks,
 * Magic history, decisions, memories, and a read-only record of Fo requests.
 * It never contains credentials: the browser has none (provider tokens live
 * sealed on the server), and the export is rebuilt from an allowlist anyway.
 */

export const EXPORT_FORMAT = 'tatada-export'
export const EXPORT_VERSION = 1
const MAX_BYTES = 5 * 1024 * 1024

export interface TatadaExport {
  format: typeof EXPORT_FORMAT
  version: number
  exportedAt: string
  state: AppState
  actionHistory: ArchivedAction[]
}

/** Server action as the client sees it (subset). */
export interface ServerActionLike {
  id: string
  provider: 'live' | 'mock'
  status: string
  draft: { intent: string; to: string; toName: string }
  progress: { at: number; text: string }[]
  result?: { outcome: string; summary: string; evidence: { kind: string; detail: string; messageId?: string }[] }
  error?: string
}

export const archive = (a: ServerActionLike): ArchivedAction => ({
  id: a.id,
  provider: a.provider,
  status: a.status,
  title: `${a.draft.intent === 'delay' ? 'Late arrival' : 'Early check-in'} · ${a.draft.toName}`,
  to: a.draft.to,
  outcome: a.result?.outcome,
  summary: a.result?.summary ?? a.error,
  evidence: (a.result?.evidence ?? []).map((e) => `${e.kind}: ${e.detail}${e.messageId ? ` (${e.messageId})` : ''}`),
  progress: a.progress.map(({ at, text }) => ({ at, text })),
})

export function buildExport(state: AppState, serverActions: ServerActionLike[], now = new Date()): TatadaExport {
  const seen = new Set<string>()
  const actionHistory = [...serverActions.map(archive), ...(state.archivedActions ?? [])].filter((a) => !seen.has(a.id) && seen.add(a.id))
  // Rebuild state from known fields only, so nothing unexpected rides along.
  const { onboarded, profile, trips, items, actions, chat, canvas, decisions, wardrobe, looks, photoHistory, countryMarks, assistantUpdates } = state
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    state: structuredClone({ onboarded, profile, trips, items, actions, chat, canvas, assistantUpdates:assistantUpdates??[], decisions: decisions ?? [], wardrobe: wardrobe ?? [], looks: looks ?? [], photoHistory: photoHistory ?? [], countryMarks: countryMarks ?? {} }),
    actionHistory,
  }
}

export type ImportResult = { ok: true; state: AppState; actions: number } | { ok: false; error: string }

export function parseImport(text: string): ImportResult {
  if (text.length > MAX_BYTES) return { ok: false, error: 'That file is too large to be a Tatada export.' }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'That file isn\'t valid JSON.' }
  }
  const o = raw as Record<string, unknown>
  let state: unknown
  let history: unknown = []
  if (o && o.format === EXPORT_FORMAT) {
    if (typeof o.version !== 'number' || o.version < 1) return { ok: false, error: 'This export has no valid version.' }
    if (o.version > EXPORT_VERSION) return { ok: false, error: 'This export comes from a newer Tatada. Update Tatada, then import it.' }
    state = o.state
    history = o.actionHistory ?? []
  } else if (isAppState(raw)) {
    // Version 0: a raw saved state (e.g. a recovery copy from this browser).
    state = raw
  } else {
    return { ok: false, error: 'This isn\'t a Tatada export.' }
  }
  const next = { ...(state as AppState), archivedActions: history as ArchivedAction[] }
  if (!isAppState(next)) return { ok: false, error: 'This export is damaged or incomplete, so nothing was imported.' }
  // Imported local actions become history too: nothing imported can run again.
  const archivedLocal: ArchivedAction[] = next.actions.map((a) => ({
    id: a.id, provider: 'simulated', status: a.status, title: a.title, to: a.recipient.contact,
    summary: a.result?.summary, evidence: a.result?.evidence ?? [], progress: a.log,
  }))
  const ids = new Set<string>()
  const archivedActions = [...(next.archivedActions ?? []), ...archivedLocal].filter((a) => !ids.has(a.id) && ids.add(a.id))
  // Chat keeps its words; links to requests that don't exist here are dropped.
  const chat = next.chat.map(({ actionId: _a, serverActionId: _s, ...m }) => m)
  return { ok: true, state: { ...next, chat, actions: [], archivedActions }, actions: archivedActions.length }
}
