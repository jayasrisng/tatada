import exifr from 'exifr'
import type { TravelPhoto } from '../types'
import { processPhoto } from '../style/camera'
import { uid } from '../state/id'
export async function readTravelPhoto(file: File): Promise<TravelPhoto> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name}: choose an image file.`)
  if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name}: larger than 25 MB.`)
  const metadata = await exifr.parse(file).catch(() => null)
  const date = metadata?.DateTimeOriginal ?? metadata?.CreateDate
  const pad = (v: number) => String(v).padStart(2, '0')
  const capturedAt = date instanceof Date && Number.isFinite(date.getTime()) ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` : ''
  const image = await processPhoto(file)
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), (v) => v.toString(16).padStart(2, '0')).join('')
  const lat = metadata?.latitude, lon = metadata?.longitude
  const gps = typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : {}
  return { id: uid(), fingerprint, filename: file.name, capturedAt, dateSource: capturedAt ? 'exif' : 'you', city: '', country: '', image: image.dataUrl, ...gps }
}
