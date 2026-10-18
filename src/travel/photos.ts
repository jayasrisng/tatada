import exifr from 'exifr'
import { processPhoto } from '../style/camera'
import { uid } from '../state/id'
import { applyLabels, metadataLabels, type ImportDraft } from './importer'

/** Reads a photo on this device: EXIF date/GPS, embedded IPTC/XMP location labels, a small preview and a SHA-256 fingerprint. */
export async function readImportPhoto(file: File): Promise<ImportDraft> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name}: choose an image file.`)
  if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name}: larger than 25 MB.`)
  const metadata = await exifr.parse(file, { tiff: true, exif: true, gps: true, iptc: true, xmp: true }).catch(() => null)
  const date = metadata?.DateTimeOriginal ?? metadata?.CreateDate
  const pad = (v: number) => String(v).padStart(2, '0')
  const capturedAt = date instanceof Date && Number.isFinite(date.getTime()) ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` : ''
  const image = await processPhoto(file)
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), (v) => v.toString(16).padStart(2, '0')).join('')
  const lat = metadata?.latitude, lon = metadata?.longitude
  const gps = typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0) ? { lat, lon } : {}
  const draft: ImportDraft = {
    id: uid(), fileName: file.name, fingerprint, image: image.dataUrl, capturedAt, dateSource: capturedAt ? 'exif' : 'you', ...gps,
    fields: { place: '', city: '', country: '' }, sources: {}, inHistory: false, inCloset: false, geocode: 'none', clothes: 'off', pieces: [],
  }
  return applyLabels(draft, metadataLabels(metadata), 'metadata')
}

