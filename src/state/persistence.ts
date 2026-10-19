import type { AppState } from '../types'
import { seed } from '../data/seed'

export const STORAGE_KEY = 'tatada:v1'
export const RECOVERY_KEY = `${STORAGE_KEY}:recovery`
export { validateWorkspace } from '../../shared/workspace'
import { validateWorkspace } from '../../shared/workspace'
export const isAppState = (value: unknown): value is AppState => validateWorkspace(value)
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>

// Receive storage lazily: even accessing window.localStorage can throw.
/** Storage key for one account's local cache. Accounts on a shared browser never share a key. */
export const accountKey = (accountId: string) => `${STORAGE_KEY}:acct:${accountId}`

export function loadState(storage: () => StorageAccess, key = STORAGE_KEY, fallback: () => AppState = seed): { state: AppState; warning: string | null } {
  const recovery = `${key}:recovery`
  try {
    const target = storage()
    const raw = target.getItem(key)
    if (raw === null) return { state: fallback(), warning: null }
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { /* handled as invalid below */ }
    if (isAppState(parsed)) return { state: parsed, warning: null }
    // Keep the original data before allowing the recovered session to persist.
    target.setItem(recovery, raw)
    return { state: fallback(), warning: `Saved data could not be loaded. A fresh copy was started; the original is backed up and can be downloaded from your profile.` }
  } catch {
    return { state: fallback(), warning: 'Browser storage is unavailable. Changes may be lost when you close or reload this page.' }
  }
}

export function saveState(state: AppState, storage: () => StorageAccess, key = STORAGE_KEY): boolean {
  try { storage().setItem(key, JSON.stringify(state)); return true } catch { return false }
}
