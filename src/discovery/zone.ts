import tzlookup from '@photostructure/tz-lookup'
import { localTimeIn, zoneOffset } from './hours'
import type { Point } from './places'

/*
 * Venue time zone from coordinates. The offline lookup is compressed and can
 * be wrong near zone borders, so a zone is trusted only when the venue and
 * four points ~5 km away share the same current UTC offset, and (for "near me")
 * when the device's own offset agrees. Otherwise no open/closed claim is made.
 */
export function reliableZone(p: Point, at: Date, deviceZone?: string): string | undefined {
  try {
    const zone = tzlookup(p.lat, p.lon), offset = zoneOffset(zone, at)
    if (offset === undefined) return undefined
    const dLat = 0.045, dLon = 0.045 / Math.max(0.2, Math.cos(p.lat * Math.PI / 180))
    const around = [[dLat, 0], [-dLat, 0], [0, dLon], [0, -dLon]].map(([a, b]) => tzlookup(Math.max(-90, Math.min(90, p.lat + a)), ((p.lon + b + 540) % 360) - 180))
    if (around.some((z) => zoneOffset(z, at) !== offset)) return undefined
    if (deviceZone !== undefined && zoneOffset(deviceZone, at) !== offset) return undefined
    return zone
  } catch { return undefined }
}

export function venueTime(p: Point, at: Date, deviceZone?: string) {
  const zone = reliableZone(p, at, deviceZone)
  return zone ? { zone, ...localTimeIn(zone, at) } : undefined
}
