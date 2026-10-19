import type { ItineraryItem, Trip } from '../types.js'
export interface SharedTrip { format: 'tatada-shared-trip'; version: 1; exportedAt: string; destination: string; country: string; start: string; end: string; itinerary: ItineraryItem[]; notes?: { day: string; text: string }[] }
/** Explicit allowlist: no bookings, reference codes, profile, documents, wallet, or private task notes. */
export function shareTrip(trip: Trip, includeMemories = false): SharedTrip {
  return { format: 'tatada-shared-trip', version: 1, exportedAt: new Date().toISOString(), destination: trip.destination, country: trip.country, start: trip.start, end: trip.end, itinerary: (trip.itinerary ?? []).map((i) => ({ id: i.id, day: i.day, time: i.time, title: i.title, dress: i.dress })), ...(includeMemories ? { notes: trip.memories.filter((m) => m.kind === 'note').map((m) => ({ day: m.day, text: m.text })) } : {}) }
}
const iso = (v: unknown): v is string => { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false; const date = new Date(v + 'T12:00:00Z'); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v }
const text = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length <= max
export function parseSharedTrip(raw: string): SharedTrip {
  if (raw.length > 1_000_000) throw new Error('This shared trip is too large.')
  let v: SharedTrip
  try { v = JSON.parse(raw) } catch { throw new Error('This file is not valid JSON.') }
  if (!v || v.format !== 'tatada-shared-trip' || v.version !== 1 || !text(v.destination) || !v.destination.trim() || !text(v.country) || !iso(v.start) || !iso(v.end) || v.end < v.start || !Array.isArray(v.itinerary) || v.itinerary.length > 300 || !v.itinerary.every((i) => i && text(i.id) && iso(i.day) && i.day >= v.start && i.day <= v.end && text(i.title, 500) && ['casual', 'active', 'dressy', 'cold'].includes(i.dress) && (i.time === undefined || /^([01]\d|2[0-3]):[0-5]\d$/.test(i.time)))) throw new Error('This is not a supported shared Tatada trip.')
  if (v.notes !== undefined && (!Array.isArray(v.notes) || v.notes.length > 300 || !v.notes.every((n) => n && text(n.day, 80) && text(n.text, 5000)))) throw new Error('This trip contains invalid journal notes.')
  // Strip unknown input fields rather than letting foreign state enter the workspace.
  return { format: 'tatada-shared-trip', version: 1, exportedAt: typeof v.exportedAt === 'string' ? v.exportedAt : '', destination: v.destination, country: v.country, start: v.start, end: v.end, itinerary: v.itinerary.map((i) => ({ id: i.id, day: i.day, time: i.time, title: i.title, dress: i.dress })), notes: v.notes?.map((n) => ({ day: n.day, text: n.text })) }
}
