/** A one-use, short-lived print gesture. Refreshes and pasted URLs never silently reprint. */
export function printRoute(tripId: string, kind: 'card' | 'journal' | 'flights' | 'hotels' | 'packing' | 'all' = 'card', ask = ''): string {
  const token = crypto.randomUUID()
  let query = ask ? `ask=${encodeURIComponent(ask)}` : ''
  try { sessionStorage.setItem(`tatada:print-intent:${token}`, JSON.stringify({tripId, kind, ask, at: Date.now()})); query += `${query ? '&' : ''}run=${token}` } catch { /* The user can still press Print on the screen. */ }
  return `/trip/${tripId}/print${kind === 'card' ? '' : `/${kind}`}${query ? '?' + query : ''}`
}
export function consumePrintIntent(token: string, tripId: string, kind: string, ask: string): boolean {
  try {
    const key = `tatada:print-intent:${token}`, raw = sessionStorage.getItem(key)
    sessionStorage.removeItem(key)
    if (!raw) return false
    const intent = JSON.parse(raw)
    return intent.tripId === tripId && intent.kind === kind && intent.ask === ask && typeof intent.at === 'number' && Date.now() >= intent.at && Date.now() - intent.at < 10 * 60_000
  } catch { return false }
}
