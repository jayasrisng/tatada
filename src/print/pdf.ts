/*
 * Clean printable PDFs for a trip: white paper, readable Helvetica, half-inch
 * margins, no app navigation or blackboard. The same bytes are uploaded,
 * previewed and (after approval) attached, so what you see is what is sent.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { ChecklistItem, Profile, Trip } from '../types'
import QRCode from 'qrcode'
import type { PrintPlan } from './plan'

const PT = 72
const SIZES = { letter: [8.5 * PT, 11 * PT], a4: [595.28, 841.89] } as const
const CARD = [4 * PT, 6 * PT] as const

const SYMBOLS: Record<string, string> = { '→': '->', '←': '<-', '↔': '<->', '⇒': '=>', '✓': 'v', '✔': 'v', '★': '*', '✶': '*', '≈': '~', '≤': '<=', '≥': '>=', '−': '-' }

/** Standard PDF fonts only cover Latin-1; other characters are transliterated or replaced, and reported. */
export function printable(text: string): { text: string; lossy: boolean } {
  let lossy = false
  const mapped = [...text.normalize('NFC')].map((ch) => SYMBOLS[ch] ?? ch).join('')
  const out = [...mapped].map((ch) => {
    if (/[ -~ -ÿ–—‘’“”•…€]/.test(ch)) return ch
    const base = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '')
    if (base && /^[ -~]+$/.test(base)) return base
    if (/\p{Extended_Pictographic}|️/u.test(ch)) return ''
    lossy = true
    return '?'
  }).join('')
  return { text: out, lossy }
}

export interface PrintDoc { kind: 'card' | 'journal'; trip: Trip; items: ChecklistItem[]; profile: Profile; printedOn: string }
export interface BuiltPdf { bytes: Uint8Array; pageCount: number; lossyText: boolean; title: string }

const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

function content(doc: PrintDoc): { title: string; subtitle: string; sections: { heading: string; lines: string[] }[] } {
  const t = doc.trip
  const subtitle = [`${fmt(t.start)} – ${fmt(t.end)}`, `${t.travelers} ${t.travelers === 1 ? 'traveler' : 'travelers'}`, doc.profile.name].filter(Boolean).join(' · ')
  if (doc.kind === 'journal') {
    const days = [...new Set(t.memories.map((m) => m.day))].sort()
    return { title: `${t.destination} journal`, subtitle, sections: days.length ? days.map((d) => ({ heading: fmt(d), lines: t.memories.filter((m) => m.day === d).map((m) => `${m.place ? `${m.place}: ` : ''}${m.text}`) })) : [{ heading: 'Memories', lines: ['No memories written yet.'] }] }
  }
  const sections = [
    { heading: 'Bookings', lines: t.bookings.length ? t.bookings.map((b) => `${b.title} — ${b.when}${b.ref ? ` · ref ${b.ref}` : ''}${b.simulated ? ' (sample)' : ''}`) : ['No bookings yet.'] },
    ...(t.localAddress ? [{ heading: 'Stay address', lines: [t.localAddress] }] : []),
    ...((t.itinerary ?? []).length ? [{ heading: 'Plan', lines: [...(t.itinerary ?? [])].sort((a, b) => `${a.day}${a.time ?? ''}`.localeCompare(`${b.day}${b.time ?? ''}`)).map((i) => `${fmt(i.day)}${i.time ? ` ${i.time}` : ''} — ${i.title}`) }] : []),
    { heading: 'Still to do', lines: doc.items.filter((i) => i.tripId === t.id && !i.done).slice(0, 14).map((i) => `[ ] ${i.text}`) },
  ].filter((s) => s.lines.length)
  return { title: `${t.destination}${t.country ? `, ${t.country}` : ''}`, subtitle, sections }
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next
      else { out.push(line); line = word }
    }
    out.push(line)
  }
  return out
}

export async function buildPdf(doc: PrintDoc, plan: Pick<PrintPlan, 'pageSize' | 'layout' | 'grayscale' | 'repeat'>): Promise<BuiltPdf> {
  const pdf = await PDFDocument.create()
  const c = content(doc)
  pdf.setTitle(c.title); pdf.setAuthor('Tatada'); pdf.setCreator('Tatada'); pdf.setProducer('Tatada')
  // Fixed dates keep identical documents byte-identical, so the approval hash is stable.
  pdf.setCreationDate(new Date(`${doc.printedOn}T00:00:00Z`)); pdf.setModificationDate(new Date(`${doc.printedOn}T00:00:00Z`))
  const regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.1, 0.1, 0.1), soft = rgb(0.38, 0.38, 0.38)
  const accent = plan.grayscale ? rgb(0.35, 0.35, 0.35) : rgb(0.12, 0.36, 0.75)
  let lossy = false
  const clean = (s: string) => { const p = printable(s); lossy ||= p.lossy; return p.text }

  const [pw, ph] = SIZES[plan.pageSize]
  const card = plan.layout === '4x6-on-plain'
  const [w, h] = card ? CARD : [pw, ph]
  const margin = card ? 0.25 * PT : 0.5 * PT
  const scale = card ? 0.62 : 1
  const pages: PDFPage[] = []
  let page!: PDFPage, ox = 0, oy = 0, y = 0, qrBottom = Infinity, qrWidth = 0
  const newPage = () => {
    page = pdf.addPage([pw, ph]); pages.push(page)
    // A 4×6 card is centered on the plain sheet, with corner cut guides.
    ox = card ? (pw - w) / 2 : 0; oy = card ? (ph - h) / 2 : 0
    if (card) for (const [x, yy] of [[ox, oy], [ox + w, oy], [ox, oy + h], [ox + w, oy + h]]) {
      page.drawLine({ start: { x: x - 14, y: yy }, end: { x: x - 4, y: yy }, thickness: 0.5, color: soft })
      page.drawLine({ start: { x: x + 4, y: yy }, end: { x: x + 14, y: yy }, thickness: 0.5, color: soft })
      page.drawLine({ start: { x, y: yy - 14 }, end: { x, y: yy - 4 }, thickness: 0.5, color: soft })
      page.drawLine({ start: { x, y: yy + 4 }, end: { x, y: yy + 14 }, thickness: 0.5, color: soft })
    }
    y = oy + h - margin
  }
  const room = (needed: number) => { if (y - needed < oy + margin + 14 * scale) newPage() }
  const text = (s: string, size: number, font: PDFFont, color = ink, gap = 1.35) => {
    // Lines beside the QR code wrap narrower so they never run under it.
    for (const line of wrap(clean(s), font, size * scale, w - margin * 2 - (y - size * scale * gap > qrBottom && pages.length === 1 ? qrWidth : 0))) {
      room(size * scale * gap)
      y -= size * scale * gap
      page.drawText(line, { x: ox + margin, y, size: size * scale, font, color })
    }
  }

  newPage()
  // Trip card: the same QR summary as before (bookings and stay), top right.
  if (doc.kind === 'card') {
    const t = doc.trip
    const summary = [`TATADA · ${t.destination} · ${fmt(t.start)} – ${fmt(t.end)}`, ...t.bookings.map((b) => `${b.title} | ${b.when} | ${b.ref}`), t.localAddress ? `Stay: ${t.localAddress}` : ''].filter(Boolean).join('\n')
    try {
      const png = await QRCode.toDataURL(summary, { margin: 1, width: 240, color: { dark: plan.grayscale ? '#222222' : '#1d1d1b', light: '#ffffff' } })
      const img = await pdf.embedPng(png)
      const size = (card ? 1.1 : 1.35) * PT
      page.drawImage(img, { x: ox + w - margin - size, y: oy + h - margin - size, width: size, height: size })
      page.drawText('scan: trip summary', { x: ox + w - margin - size, y: oy + h - margin - size - 10, size: 7, font: regular, color: soft })
      qrBottom = oy + h - margin - size - 14; qrWidth = size + 12
    } catch { /* the same details are printed as text */ }
  }
  text('tatada', 11, bold, accent)
  y -= 6 * scale
  text(c.title, 28, bold)
  text(c.subtitle, 12, regular, soft)
  y -= 8 * scale
  for (const s of c.sections) {
    room(40 * scale)
    y -= 10 * scale
    text(s.heading.toUpperCase(), 10, bold, accent)
    page.drawLine({ start: { x: ox + margin, y: y - 4 * scale }, end: { x: ox + w - margin - (y - 4 * scale > qrBottom && pages.length === 1 ? qrWidth : 0), y: y - 4 * scale }, thickness: 0.6, color: accent })
    y -= 6 * scale
    for (const l of s.lines) text(l, 12, regular)
  }
  for (const [i, p] of pages.entries()) p.drawText(clean(`Printed from Tatada · ${fmt(doc.printedOn)}${pages.length > 1 ? ` · ${i + 1}/${pages.length}` : ''}`), { x: (card ? (pw - w) / 2 : 0) + margin, y: (card ? (ph - h) / 2 : 0) + margin * 0.6, size: card ? 6 : 8, font: regular, color: soft })

  // Disclosed copies workaround: repeat every page in order, once per copy.
  if (plan.repeat > 1) {
    const original = pdf.getPageIndices()
    for (let r = 1; r < plan.repeat; r++) for (const p of await pdf.copyPages(pdf, original)) pdf.addPage(p)
  }
  const bytes = await pdf.save({ useObjectStreams: false })
  return { bytes, pageCount: pdf.getPageCount(), lossyText: lossy, title: c.title }
}
