import type { DressCode, Garment, GarmentCategory, Look, Trip } from '../types'
import { daysOf, fmtDay } from '../magic/dates'

/*
 * Outfit suggestions from the traveler's own closet. The only inputs are the
 * clothes and the trip's itinerary (each item's dress code). No weather is
 * invented: "cold" only comes from an itinerary item marked cold.
 */

export interface Suggestion {
  garmentIds: string[]
  day?: string
  why: string
}

const RANK: Record<DressCode, number> = { casual: 0, active: 1, cold: 2, dressy: 3 }

export function tripDays(trip: Trip): string[] {
  const stay = trip.bookings.find((b) => b.kind === 'stay')
  const start = stay?.checkIn && stay.checkIn >= trip.start ? stay.checkIn : trip.start
  return daysOf(start, trip.end)
}

/** The most demanding dress code planned that day. */
export function dayCode(trip: Trip, day: string): DressCode {
  return (trip.itinerary ?? []).filter((i) => i.day === day).reduce<DressCode>((c, i) => (RANK[i.dress] > RANK[c] ? i.dress : c), 'casual')
}

export const byCategory = (w: Garment[]) => {
  const out: Record<GarmentCategory, Garment[]> = { top: [], bottom: [], dress: [], layer: [], shoes: [] }
  for (const g of w) out[g.category].push(g)
  return out
}

const key = (ids: string[]) => [...ids].sort().join('+')

function score(parts: Garment[], code: DressCode): number {
  const has = (v: Garment['vibe'][number]) => parts.filter((p) => p.vibe.includes(v)).length
  const dress = parts.some((p) => p.category === 'dress')
  const layer = parts.some((p) => p.category === 'layer')
  switch (code) {
    case 'dressy':
      return (dress ? 4 : 0) + has('dressy') * 2
    case 'active':
      return has('active') * 2 - (dress ? 4 : 0)
    case 'cold':
      return (layer ? 4 : 0) + has('warm') * 2 - (dress && !layer ? 2 : 0)
    default:
      return has('casual') - (dress ? 1 : 0)
  }
}

/** Every distinct outfit the closet can make: dress or top+bottom, best shoes, optional layer. */
export function combos(w: Garment[], code: DressCode): Garment[][] {
  const c = byCategory(w)
  const shoeFor = (parts: Garment[]) => [...c.shoes].sort((a, b) => score([...parts, b], code) - score([...parts, a], code))[0]
  const bases: Garment[][] = [...c.dress.map((d) => [d]), ...c.top.flatMap((t) => c.bottom.map((b) => [t, b]))]
  const out: Garment[][] = []
  for (const base of bases) {
    const withShoes = (parts: Garment[]) => {
      const s = shoeFor(parts)
      return s ? [...parts, s] : parts
    }
    out.push(withShoes(base))
    for (const l of c.layer) out.push(withShoes([...base, l]))
  }
  return out
}

export function generateLooks(wardrobe: Garment[], trip: Trip, looks: Look[] = [], extras = 6): Suggestion[] {
  const seen = new Set(looks.filter((l) => l.tripId === trip.id).map((l) => key(l.garmentIds)))
  const used = new Set<string>()
  const out: Suggestion[] = []
  for (const day of tripDays(trip)) {
    const code = dayCode(trip, day)
    const best = combos(wardrobe, code)
      .filter((c) => !seen.has(key(c.map((g) => g.id))) && !used.has(key(c.map((g) => g.id))))
      .sort((a, b) => score(b, code) - score(a, code))[0]
    if (!best) continue
    const ids = best.map((g) => g.id)
    used.add(key(ids))
    const plans = (trip.itinerary ?? []).filter((i) => i.day === day).map((i) => i.title)
    out.push({ garmentIds: ids, day, why: `${fmtDay(day)} · ${plans.length ? plans.join(', ') : 'free day'}${code !== 'casual' ? ` · ${code}` : ''}` })
  }
  // A few more mix-and-match ideas, without a day.
  for (const c of combos(wardrobe, 'casual')) {
    if (out.length >= tripDays(trip).length + extras) break
    const ids = c.map((g) => g.id)
    if (seen.has(key(ids)) || used.has(key(ids))) continue
    used.add(key(ids))
    out.push({ garmentIds: ids, why: 'another mix from your closet' })
  }
  return out
}

/** What to pack: each kept garment once, grouped by category. */
export function packingList(wardrobe: Garment[], looks: Look[], tripId: string) {
  const ids = new Set(looks.filter((l) => l.tripId === tripId && l.verdict === 'keep').flatMap((l) => l.garmentIds))
  const groups = byCategory(wardrobe.filter((g) => ids.has(g.id)))
  return { groups, count: ids.size }
}
