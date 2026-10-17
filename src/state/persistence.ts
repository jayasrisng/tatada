import type { AppState } from '../types'
import { seed } from '../data/seed'

export const STORAGE_KEY = 'tatada:v1'
export const RECOVERY_KEY = `${STORAGE_KEY}:recovery`
type Check = (value: unknown) => boolean
const str: Check = (v) => typeof v === 'string'
const num: Check = (v) => typeof v === 'number' && Number.isFinite(v)
const bool: Check = (v) => typeof v === 'boolean'
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const optional = (check: Check): Check => (v) => v === undefined || check(v)
const list = (check: Check): Check => (v) => Array.isArray(v) && v.every(check)
const oneOf = (...values: string[]): Check => (v) => typeof v === 'string' && values.includes(v)
const shape = (fields: Record<string, Check>): Check => (v) => object(v) && Object.entries(fields).every(([key, check]) => check(v[key]))
const record = (check: Check): Check => (v) => object(v) && Object.values(v).every(check)
const strings = list(str)
const tint = oneOf('yellow', 'pink', 'blue', 'green', 'orange')
const phase = oneOf('discover', 'plan', 'prepare', 'travel', 'remember')
const category = oneOf('flight', 'stay', 'move', 'eat')
const result = shape({ summary: str, evidence: strings })
const action = shape({
  id: str, tripId: optional(str), title: str, channel: oneOf('email', 'call', 'fo'),
  recipient: shape({ name: str, contact: str }), script: str, dataShared: strings, cost: str,
  risk: oneOf('low', 'medium', 'high'), mode: oneOf('simulated', 'real'),
  status: oneOf('proposed', 'running', 'needs_input', 'done', 'verified', 'failed', 'cancelled'),
  plan: list(shape({ text: str, question: optional(shape({ text: str, options: strings })) })),
  cursor: (v) => num(v) && Number.isInteger(v) && (v as number) >= 0,
  log: list(shape({ text: str, at: num })), answers: strings, result: optional(result),
  outcomeKey: optional(str), checklistItemId: optional(str), createdAt: num,
})
const trip = shape({
  id: str, destination: str, country: str, start: str, end: str, travelers: num, companions: str,
  budget: num, vibe: strings, constraints: strings, discounts: strings,
  status: oneOf('planning', 'upcoming', 'past'), tint, summary: record(str), localAddress: optional(str),
  options: list(shape({ id: str, category, title: str, subtitle: str, price: str,
    status: oneOf('chosen', 'considering', 'rejected'), reason: optional(str), highlights: strings,
    tradeoffs: strings, metrics: record(str), sources: list(shape({ label: str, kind: oneOf('reviews', 'official', 'fares', 'forum', 'map') })) })),
  bookings: list(shape({ id: str, kind: oneOf('flight', 'stay', 'dinner', 'transfer', 'activity'), title: str, when: str, ref: str, detail: str, simulated: bool })),
  memories: list(shape({ id: str, day: str, text: str, kind: oneOf('note', 'photo', 'receipt'), place: optional(str), tint: optional(tint) })),
})
const stateShape = shape({
  onboarded: bool,
  profile: shape({ name: str, homeAirport: str, style: strings, diet: strings, memberships: strings }),
  trips: list(trip),
  items: list(shape({ id: str, tripId: optional(str), text: str, phase, done: bool,
    kind: oneOf('booking', 'task', 'doc', 'pack', 'idea', 'memory'), note: optional(str), magicPrompt: optional(str), actionId: optional(str) })),
  actions: list(action),
  chat: list(shape({ id: str, from: oneOf('me', 'tatada'), text: str, actionId: optional(str), bullets: optional(strings), addedItems: optional(strings) })),
  canvas: record(shape({ x: num, y: num, r: num })),
})
export const isAppState = (value: unknown): value is AppState => stateShape(value)
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>

// Receive storage lazily: even accessing window.localStorage can throw.
export function loadState(storage: () => StorageAccess): { state: AppState; warning: string | null } {
  try {
    const target = storage()
    const raw = target.getItem(STORAGE_KEY)
    if (raw === null) return { state: seed(), warning: null }
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { /* handled as invalid below */ }
    if (isAppState(parsed)) return { state: parsed, warning: null }
    // Keep the original data before allowing the recovered session to persist.
    target.setItem(RECOVERY_KEY, raw)
    return { state: seed(), warning: `Saved data could not be loaded. Demo data was restored; the original is backed up in ${RECOVERY_KEY}.` }
  } catch {
    return { state: seed(), warning: 'Browser storage is unavailable. Changes may be lost when you close or reload this page.' }
  }
}

export function saveState(state: AppState, storage: () => StorageAccess): boolean {
  try { storage().setItem(STORAGE_KEY, JSON.stringify(state)); return true } catch { return false }
}
