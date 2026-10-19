import type { Trip } from '../types'
export const OFFLINE_SELECTED = 'tatada:offline:selected:v1'
export const packKey = (workspace: string, tripId: string) => `${workspace}:offline:${tripId}`
export interface TripPack { version: 1; workspace: string; savedAt: string; lastSyncedAt?: number; trip: Trip; tickets: string[] }
/** Intentional essentials allowlist; no profile, chat, vault, tokens or decrypted documents. */
export function makePack(workspace: string, trip: Trip, tickets: string[], now = new Date(), lastSyncedAt?: number): TripPack {
  return { version: 1, workspace, savedAt: now.toISOString(), lastSyncedAt, tickets: [...new Set(tickets)], trip: {
    id: trip.id, destination: trip.destination, country: trip.country, start: trip.start, end: trip.end, timeZone: trip.timeZone,
    travelers: trip.travelers, companions: '', budget: 0, vibe: [], constraints: [], discounts: [], status: trip.status, tint: trip.tint,
    summary: {}, options: [], memories: [], bookings: trip.bookings.map(b => ({ ...b, flight: b.flight ? { ...b.flight } : undefined })),
    itinerary: trip.itinerary?.map(i => ({ ...i })), localAddress: trip.localAddress, arrival: trip.arrival,
    journeyDone: trip.journeyDone ? { ...trip.journeyDone } : undefined, research: trip.research?.map(r => ({ ...r, sections: r.sections.map(s => ({ text: s.text, sources: s.sources.map(u => ({ ...u })) })) })),
  } }
}
export function loadSelectedPack(): TripPack | null {
  try {
    const key = localStorage.getItem(OFFLINE_SELECTED)
    if (!key) return null
    const p = JSON.parse(localStorage.getItem(key) ?? 'null') as TripPack
    return p?.version === 1 && typeof p.workspace === 'string' && typeof p.savedAt === 'string' && typeof p.trip?.id === 'string' && Array.isArray(p.trip.bookings) && Array.isArray(p.tickets) ? p : null
  } catch { return null }
}
export async function prepareOfflineShell() {
  if (import.meta.env.DEV) throw new Error('Offline cold launch requires the production preview. Build and open its preview before downloading.')
  if (!('serviceWorker' in navigator)) throw new Error('This browser needs HTTPS and service worker support for offline launch.')
  await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
  await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('Offline shell was not ready. Keep the connection open and retry.')), 45000))])
}
