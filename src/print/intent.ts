/** Opening print settings never authorizes delivery. Approval happens inside the panel. */
export function printRoute(tripId: string, kind: 'card' | 'journal' | 'flights' | 'hotels' | 'packing' | 'all' = 'card', ask = ''): string {
  return `/trip/${tripId}/print${kind === 'card' ? '' : `/${kind}`}?panel=1${ask ? `&ask=${encodeURIComponent(ask)}` : ''}`
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
