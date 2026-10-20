import { type Color, type PDFPage } from 'pdf-lib'
import type { Trip } from '../types'

export type TravelDoodle = 'car' | 'food' | 'coffee' | 'mountain' | 'tree' | 'bed' | 'star' | 'walk'
export function stopDoodle(title: string): TravelDoodle {
  if (/drive|driv|rental|car\b|homebound|road|pickup|pick up|shuttle|continue west|home arrival|→|->/i.test(title)) return 'car'
  if (/coffee|café|cafe|tea\b/i.test(title)) return 'coffee'
  if (/lunch|dinner|breakfast|food|picnic|meal|snack|eat\b/i.test(title)) return 'food'
  if (/stay|hotel|check.in|sleep|room/i.test(title)) return 'bed'
  if (/hike|trail|walk|out.and.back/i.test(title)) return 'walk'
  if (/park|forest|grove|meadow/i.test(title)) return 'tree'
  return 'mountain'
}

const paths: Record<TravelDoodle, string> = {
  car: 'M3 20 L4 13 L9 12 L12 6 L23 6 L28 13 L30 14 L30 23 L3 23 Z M9 12 L26 12 M17 6 L17 12 M9 19 L10 19 M25 19 L26 19 M6 23 L6 27 L11 27 L11 23 M23 23 L23 27 L28 27 L28 23',
  food: 'M4 3 L4 12 Q4 16 8 16 L8 29 M8 3 L8 12 M12 3 L12 12 Q12 16 8 16 M25 3 Q18 10 21 18 L25 18 L25 29 M25 3 L25 18',
  coffee: 'M4 12 L22 12 L22 23 Q20 28 13 28 Q6 28 4 23 Z M22 13 Q31 11 29 18 Q28 22 22 22 M2 30 L25 30 M9 8 Q5 5 10 2 M17 8 Q13 5 18 2',
  mountain: 'M1 28 L12 7 L20 19 L25 11 L33 28 Z M8 14 L12 17 L16 13 M22 17 L25 19 L28 16',
  tree: 'M16 2 L7 12 L11 12 L4 21 L11 21 L5 28 L27 28 L21 21 L28 21 L21 12 L25 12 Z M14 28 L14 32 M18 28 L18 32',
  bed: 'M3 8 L3 29 M3 23 L29 23 L29 29 M3 18 L29 18 L29 23 M7 12 L14 12 L14 18 L7 18 Z M16 14 L27 14 L29 18',
  star: 'M16 2 L19 12 L30 9 L22 17 L30 25 L19 22 L16 32 L13 22 L2 25 L10 17 L2 9 L13 12 Z',
  walk: 'M7 3 L15 3 L15 15 L25 20 Q29 22 28 27 L4 27 L3 20 L6 13 Z M6 13 L15 15 M5 23 L27 23 M8 8 L13 8 M8 11 L13 11',
}
/** Small pen drawings: vector strokes survive grayscale and remain sharp on paper. */
export function drawTravelDoodle(page: PDFPage, kind: TravelDoodle, x: number, y: number, size: number, ink: Color) {
  page.drawSvgPath(paths[kind], { x, y: y + size, scale: size / 34, borderColor: ink, borderWidth: 1.25 })
}

/** A scannable public destination, never a localhost page or private booking reference. */
export function tripMapUrl(trip: Pick<Trip, 'destination' | 'country'>): string {
  if (/yosemite/i.test(trip.destination)) return 'https://www.nps.gov/yose/planyourvisit/maps.htm'
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([trip.destination, trip.country].filter(Boolean).join(', '))}`
}

export function notebookDay(day: string) {
  const date = new Date(`${day}T00:00:00Z`), number = date.getUTCDate()
  const suffix = number % 100 >= 11 && number % 100 <= 13 ? 'th' : ({1:'st',2:'nd',3:'rd'}[number % 10] ?? 'th')
  return `${date.toLocaleDateString('en-US', {month:'long',timeZone:'UTC'})} ${number}${suffix}`
}
export function notebookTime(time?: string) {
  if (!time) return 'Take your time'
  const [hours,minutes] = time.split(':').map(Number)
  return `${hours % 12 || 12}${minutes ? `:${String(minutes).padStart(2,'0')}` : ''} ${hours < 12 ? 'am' : 'pm'}`
}
