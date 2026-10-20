import { drawNotebookPaper, drawTravelDoodle, stopDoodle, tripMapUrl, notebookDay, notebookTime } from './notebook'
import { flightNotes } from './flight'
import {humanWhen} from '../travel/display'
/*
 * Clean printable PDFs for a trip: white paper, readable Helvetica, half-inch
 * margins, no app navigation or blackboard. The same bytes are uploaded,
 * previewed and (after approval) attached, so what you see is what is sent.
 */
import { PDFDocument, PDFString, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
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

export interface PrintSticker {id:string;image:string;label:string;x:number;y:number;page:number}
export interface PrintDoc { kind: 'card' | 'journal' | 'flights' | 'hotels' | 'packing' | 'all'; trip: Trip; items: ChecklistItem[]; profile: Profile; packing?: {name:string;category:string;image?:string}[]; packingOutfits?: {name:string;pieces:{name:string;image?:string}[]}[]; stickers?:PrintSticker[]; decoration?: 'star'|'sun'|'heart'; caption?: string; printedOn: string }
export interface BuiltPdf { bytes: Uint8Array; pageCount: number; lossyText: boolean; title: string }

const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

function content(doc: PrintDoc): { title: string; subtitle: string; sections: { heading: string; lines: string[]; tiles?: {name:string;image?:string}[]; images?: {image?: string; illustration?: 'sydney-harbour'|'sydney-lunch'; caption: string}[] }[] } {
  const t = doc.trip
  const subtitle = [`${fmt(t.start)} – ${fmt(t.end)}`, `${t.travelers} ${t.travelers === 1 ? 'traveler' : 'travelers'}`, doc.profile.name].filter(Boolean).join(' · ')
  if (doc.kind === 'packing') {
    const tasks=doc.items.filter(i=>i.tripId===t.id&&i.kind==='pack')
    const listed=new Set(tasks.map(i=>i.text.replace(/^pack:\s*/i,'').trim().toLowerCase()))
    const clothes=(doc.packing??[]).filter(g=>!listed.has(g.name.toLowerCase()))
    return {title:`${t.destination} / Packing`,subtitle,sections:[
      ...(tasks.length?[{heading:'Your checklist',lines:tasks.map(i=>`${i.done?'[x]':'[ ]'} ${i.text}`)}]:[]),
      ...(clothes.length?[{heading:'From your saved outfits',lines:clothes.map(g=>`[ ] ${g.name} / ${g.category}`)}]:[]),
      ...(doc.packingOutfits?.length ? doc.packingOutfits.map(outfit=>({heading:outfit.name,lines:[],tiles:outfit.pieces})) : clothes.length ? [{heading:'Your clothes',lines:[],tiles:clothes}] : []),
      ...(!tasks.length&&!clothes.length&&!doc.packingOutfits?.length?[{heading:'Packing',lines:['No packing items saved yet.']}]:[]),
    ]}
  }
  if (doc.kind === 'journal') {
    const days = [...new Set(t.memories.map((m) => m.day))].sort()
    return { title: `${t.destination} journal`, subtitle, sections: days.length ? days.map((d) => ({ heading: fmt(d), lines: t.memories.filter((m) => m.day === d).map((m) => `${m.place ? `${m.place}: ` : ''}${m.text}`), images: t.memories.filter(m => m.day === d && (m.image || m.illustration)).map(m => ({image: m.image, illustration:m.illustration, caption: m.place ?? 'A moment to keep'})) })) : [{ heading: 'Memories', lines: ['No memories written yet.'] }] }
  }
  if (doc.kind === 'hotels') {
    const bookings = t.bookings.filter(b => b.kind === 'stay')
    return {title: `${t.destination} / Stay`, subtitle, sections: bookings.length ? bookings.map(b => ({heading: b.title, lines: [b.when, b.detail, ...(b.checkIn ? [`Check in: ${fmt(b.checkIn)}`] : []), ...(b.checkOut ? [`Check out: ${fmt(b.checkOut)}`] : []), ...(b.address?[b.address]:t.localAddress&&b.id===t.bookings.find(b=>b.kind==='stay')?.id?[t.localAddress]:[]), ...(b.ref ? [`Reference: ${b.ref}`] : []), ...(b.contact ? [`Contact: ${b.contact}`] : []), ...(b.simulated ? ['Sample booking - not a ticket or reservation.'] : [])]})) : [{heading: 'Stay', lines: ['No booking saved yet.']}]}
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

/** Vector keepsake stickers stay sharp on paper and need no emoji font. */
function decorate(page:PDFPage,doc:PrintDoc,font:PDFFont,x:number,y:number,width:number,grayscale:boolean){
 const color=grayscale?rgb(.4,.4,.4):rgb(.64,.39,.28),cx=x+width-13,cy=y+9
 if(doc.decoration==='sun'){
  page.drawCircle({x:cx,y:cy,size:5,borderColor:color,borderWidth:1})
  for(let i=0;i<8;i++){const a=i*Math.PI/4;page.drawLine({start:{x:cx+8*Math.cos(a),y:cy+8*Math.sin(a)},end:{x:cx+12*Math.cos(a),y:cy+12*Math.sin(a)},color,thickness:1})}
 }else if(doc.decoration==='heart'){
  page.drawSvgPath('M 0 4 C -14 -5 -10 -13 -4 -11 C -2 -11 0 -9 0 -7 C 0 -9 2 -11 4 -11 C 10 -13 14 -5 0 4 Z',{x:cx,y:cy-3,color})
 }else if(doc.decoration==='star'){
  const points=Array.from({length:10},(_,i)=>{const a=Math.PI/2+i*Math.PI/5,r=i%2?4.5:11;return [cx+r*Math.cos(a),cy+r*Math.sin(a)]})
  for(let i=0;i<10;i++)page.drawLine({start:{x:points[i][0],y:points[i][1]},end:{x:points[(i+1)%10][0],y:points[(i+1)%10][1]},color,thickness:1.2})
 }
 if(doc.caption?.trim()){
  const caption=printable(doc.caption.trim().slice(0,80)).text;let size=10
  while(font.widthOfTextAtSize(caption,size)>width-42&&size>6)size-=.25
  page.drawText(caption,{x,y:y+5,font,size,color})
 }
}

async function stampStickers(pdf:PDFDocument,stickers:PrintSticker[]=[]){
 for(const sticker of stickers.slice(0,24)){
  if(!Number.isInteger(sticker.page)||sticker.page<0||sticker.page>=pdf.getPageCount()||!Number.isFinite(sticker.x)||!Number.isFinite(sticker.y)||!sticker.image.startsWith('data:image/png;base64,')||sticker.image.length>80000)continue
  try{const page=pdf.getPage(sticker.page),image=await pdf.embedPng(sticker.image),size=32,{width,height}=page.getSize();page.drawImage(image,{x:Math.max(0,Math.min(width-size,sticker.x*width-size/2)),y:Math.max(0,Math.min(height-size,(1-sticker.y)*height-size/2)),width:size,height:size})}catch{/* Unsupported sticker data never prevents printing travel details. */}
 }
}

export async function buildPdf(doc: PrintDoc, plan: Pick<PrintPlan, 'pageSize' | 'layout' | 'grayscale' | 'repeat'>): Promise<BuiltPdf> {
  if (doc.kind === 'all') return bundlePdf(doc, plan)
  if (doc.kind === 'card') return notebookPdf(doc, plan)
  if (doc.kind === 'flights') return flightPdf(doc, plan)
  const pdf = await PDFDocument.create()
  const c = content(doc)
  pdf.setTitle(c.title); pdf.setAuthor('Tatada'); pdf.setCreator('Tatada'); pdf.setProducer('Tatada')
  // Fixed dates keep identical documents byte-identical, so the approval hash is stable.
  pdf.setCreationDate(new Date(`${doc.printedOn}T00:00:00Z`)); pdf.setModificationDate(new Date(`${doc.printedOn}T00:00:00Z`))
  const regular = await pdf.embedFont(StandardFonts.TimesRomanItalic), bold = await pdf.embedFont(StandardFonts.TimesRomanBoldItalic)
  const ink = rgb(0.1, 0.1, 0.1), soft = rgb(0.38, 0.38, 0.38)
  const accent = plan.grayscale ? rgb(0.35, 0.35, 0.35) : rgb(0.25, 0.43, 0.32)
  let lossy = false
  const clean = (s: string) => { const p = printable(s); lossy ||= p.lossy; return p.text }

  const [pw, ph] = SIZES[plan.pageSize]
  const card = plan.layout === '4x6-on-plain'
  const [w, h] = card ? CARD : [pw, ph]
  const margin = card ? 0.4 * PT : 0.75 * PT
  const scale = card ? 0.62 : 1
  const pages: PDFPage[] = []
  let page!: PDFPage, ox = 0, oy = 0, y = 0
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
    drawNotebookPaper(page,ox+6*scale,oy+9*scale,w-12*scale,h-18*scale,plan.grayscale,scale)
    drawTravelDoodle(page,doc.kind==='hotels'?'bed':doc.kind==='packing'?'suitcase':'camera',ox+w-margin-30*scale,oy+h-margin-28*scale,28*scale,accent)
    y = oy + h - margin
  }
  const room = (needed: number) => { if (y - needed < oy + margin + 60 * scale) newPage() }
  const text = (s: string, size: number, font: PDFFont, color = ink, gap = 1.35) => {
    for (const line of wrap(clean(s), font, size * scale, w - margin * 2)) {
      room(size * scale * gap)
      y -= size * scale * gap
      page.drawText(line, { x: ox + margin, y, size: size * scale, font, color })
    }
  }

  newPage()
  const heading = () => {
  text(`tatada / ${doc.kind === 'hotels' ? 'A LITTLE PLACE TO LAND' : doc.kind === 'journal' ? 'THE MOMENTS WE KEPT' : 'YOUR LITTLE WORLD'}`, 11, bold, accent)
  y -= 6 * scale
  text(c.title, 28, bold)
  text(c.subtitle, 12, regular, soft)
  y -= 8 * scale
  }
  heading()
  for (const [sectionIndex, s] of c.sections.entries()) {
    if (sectionIndex > 0 && (doc.kind === 'hotels' || doc.kind === 'journal')) { newPage(); heading() }
    room((s.tiles?.length ? 225 : 40) * scale)
    y -= 10 * scale
    text(s.heading, 17, bold, accent)
    page.drawLine({ start: { x: ox + margin, y: y - 4 * scale }, end: { x: ox + w - margin, y: y - 4 * scale }, thickness: 0.6, color: accent })
    y -= 6 * scale
    for (const l of s.lines) { text(l, 12, regular); if (doc.kind === 'journal') y -= 6 * scale }
    if (doc.kind === 'hotels') {
      y -= 22 * scale
      for (let x = ox + margin; x < ox + w - margin; x += 9 * scale) page.drawLine({start:{x, y}, end:{x:Math.min(x+4*scale, ox+w-margin), y}, thickness:0.6, color:accent})
      y -= 10 * scale
      text('Drop your bags. Take a breath. You made it.', 10, regular, soft)
    }
    if (s.tiles?.length) {
      const columns = 3, gap = 12 * scale, tileWidth = (w-margin*2-gap*2)/columns, tileHeight = 140*scale
      for (let row=0;row<s.tiles.length;row+=columns) {
        room(tileHeight+40*scale); const top=y
        for (const [col,piece] of s.tiles.slice(row,row+columns).entries()) {
          const x=ox+margin+col*(tileWidth+gap), bottom=top-tileHeight
          page.drawRectangle({x,y:bottom,width:tileWidth,height:tileHeight,color:rgb(.97,.96,.93)})
          try {
            if (!piece.image) throw Error('No saved photo')
            const image = await embedPhoto(pdf,piece.image), fit=Math.min((tileWidth-12*scale)/image.width,(tileHeight-16*scale)/image.height)
            page.drawImage(image,{x:x+(tileWidth-image.width*fit)/2,y:bottom+(tileHeight-image.height*fit)/2,width:image.width*fit,height:image.height*fit})
          } catch { page.drawText('No saved photo',{x:x+6*scale,y:bottom+tileHeight/2,size:8*scale,font:regular,color:soft}) }
          for (const [lineIndex,line] of wrap(clean(piece.name),regular,9*scale,tileWidth).slice(0,2).entries()) page.drawText(line,{x,y:bottom-(12+lineIndex*11)*scale,size:9*scale,font:regular,color:ink})
        }
        y=top-tileHeight-38*scale
      }
    }
    for (const photo of s.images ?? []) {
      try {
        let bytes: string | ArrayBuffer | undefined = photo.image
        if (!bytes && photo.illustration && typeof document !== 'undefined') {
          const asset = new URL(`journal/${photo.illustration}-v1.jpg`, document.baseURI)
          const response = await fetch(asset); if (!response.ok) throw new Error('Illustration unavailable')
          bytes = await response.arrayBuffer()
        }
        if (!bytes) continue
        const img = await embedPhoto(pdf,bytes)
        const width = Math.min(w-margin*2, 300*scale), height = Math.min(180*scale, width*img.height/img.width)
        const actualWidth = height*img.width/img.height
        room(height + 65*scale); y -= height + 20*scale
        page.drawRectangle({x:ox+margin-8*scale,y:y-25*scale,width:actualWidth+16*scale,height:height+35*scale,color:rgb(1,1,1),borderColor:plan.grayscale?rgb(.75,.75,.75):rgb(.8,.77,.67),borderWidth:.6})
        page.drawImage(img, {x:ox+margin, y, width:actualWidth, height})
        page.drawRectangle({x:ox+margin+actualWidth/2-27*scale,y:y+height-5*scale,width:54*scale,height:15*scale,color:plan.grayscale?rgb(.9,.9,.9):rgb(.94,.86,.62),opacity:.65})
        y-=8*scale;text(photo.caption, 10, regular, soft);y-=25*scale
      } catch { text('Photo could not be included.', 10, regular, soft) }
    }
  }
  if(doc.kind==='journal'){room(40*scale);y-=15*scale;text('One little thing I want to remember...',12,regular,soft)}
  for (const [i, p] of pages.entries()) {
    const x=(card?(pw-w)/2:0)+margin,bottom=(card?(ph-h)/2:0)+18*scale
    drawTravelDoodle(p,'star',x,bottom+9*scale,21*scale,accent)
    p.drawText('tatada',{x:x+28*scale,y:bottom+14*scale,size:21*scale,font:bold,color:accent})
    p.drawText(clean(`${fmt(doc.printedOn)} / ${i+1}${doc.trip.presentation?' / sample trip':''}`),{x:x+100*scale,y:bottom+14*scale,size:7*scale,font:regular,color:soft})
    decorate(p,doc,regular,x,bottom+39*scale,w-margin*2,plan.grayscale)
  }

  await stampStickers(pdf,doc.stickers)
  // Disclosed copies workaround: repeat every page in order, once per copy.
  if (plan.repeat > 1) {
    const original = pdf.getPageIndices()
    for (let r = 1; r < plan.repeat; r++) for (const p of await pdf.copyPages(pdf, original)) pdf.addPage(p)
  }
  const bytes = await pdf.save({ useObjectStreams: false })
  return { bytes, pageCount: pdf.getPageCount(), lossyText: lossy, title: c.title }
}

/** A travel notebook, with one dated timeline and useful public-map QR. */
async function notebookPdf(doc: PrintDoc, plan: Pick<PrintPlan,'pageSize'|'layout'|'grayscale'|'repeat'>): Promise<BuiltPdf> {
  const pdf = await PDFDocument.create(), trip = doc.trip
  const title = `${trip.destination} / Travel notebook`
  pdf.setTitle(title); pdf.setAuthor('Tatada'); pdf.setCreator('Tatada'); pdf.setProducer('Tatada')
  pdf.setCreationDate(new Date(`${doc.printedOn}T00:00:00Z`));pdf.setModificationDate(new Date(`${doc.printedOn}T00:00:00Z`))
  const pen = await pdf.embedFont(StandardFonts.TimesRomanItalic), heading = await pdf.embedFont(StandardFonts.TimesRomanBoldItalic)
  const sans = await pdf.embedFont(StandardFonts.TimesRomanItalic), bold = await pdf.embedFont(StandardFonts.TimesRomanBoldItalic)
  const [pw,ph] = SIZES[plan.pageSize], small = plan.layout === '4x6-on-plain'
  const [w,h] = small ? CARD : [pw,ph], scale = small ? .53 : 1
  const ox=(pw-w)/2,oy=(ph-h)/2,left=ox+58*scale,right=ox+w-38*scale,width=right-left
  const ink=plan.grayscale?rgb(.2,.2,.2):rgb(.19,.24,.22), muted=plan.grayscale?rgb(.43,.43,.43):rgb(.42,.45,.41), green=plan.grayscale?rgb(.3,.3,.3):rgb(.26,.39,.3)
  const rust=plan.grayscale?rgb(.4,.4,.4):rgb(.67,.38,.25), ruled=plan.grayscale?rgb(.9,.9,.9):rgb(.85,.88,.82)
  let lossy=false, page!:PDFPage, y=0
  const clean=(value:string)=>{const result=printable(value);lossy ||=result.lossy;return result.text}
  const write=(value:string,x:number,yy:number,size:number,font=pen,color=ink)=>page.drawText(clean(value),{x,y:yy,size:size*scale,font,color})
  const qrUrl=tripMapUrl(trip)
  const qr=await pdf.embedPng(await QRCode.toDataURL(qrUrl,{margin:4,width:400,errorCorrectionLevel:'M',color:{dark:plan.grayscale?'#333333':'#243b2b',light:'#ffffff'}}))
  const pages:PDFPage[]=[]
  function newPage(continued=false){
    page=pdf.addPage([pw,ph]);pages.push(page)
    if(small)for(const [x,yy] of [[ox,oy],[ox+w,oy],[ox,oy+h],[ox+w,oy+h]]){
      page.drawLine({start:{x:x-8,y:yy},end:{x:x-3,y:yy},color:muted,thickness:.5})
      page.drawLine({start:{x,y:yy-8},end:{x,y:yy-3},color:muted,thickness:.5})
    }
    page.drawRectangle({x:ox+6*scale,y:oy+9*scale,width:w-12*scale,height:h-18*scale,color:plan.grayscale?rgb(1,1,1):rgb(.995,.987,.952)})
    for(let yy=oy+94*scale;yy<oy+h-155*scale;yy+=24*scale)page.drawLine({start:{x:left-5*scale,y:yy},end:{x:right,y:yy},color:ruled,thickness:.35*scale})
    page.drawLine({start:{x:ox+43*scale,y:oy+83*scale},end:{x:ox+43*scale,y:oy+h-33*scale},color:plan.grayscale?ruled:rgb(.85,.65,.59),thickness:.7*scale})
    for(let yy=oy+130*scale;yy<oy+h-65*scale;yy+=88*scale)page.drawCircle({x:ox+23*scale,y:yy,size:4*scale,color:rgb(1,1,1),borderColor:ruled,borderWidth:.7*scale})
    const top=oy+h-44*scale
    write('A LITTLE ADVENTURE / FIELD NOTES',left,top,9,bold,green)
    let titleSize=36
    while(heading.widthOfTextAtSize(clean(trip.destination),titleSize*scale)>width-88*scale&&titleSize>22)titleSize--
    const titleLines=wrap(clean(trip.destination),heading,titleSize*scale,width-88*scale)
    for(const [lineIndex,line] of titleLines.entries())write(line,left,top-(43+lineIndex*(titleSize+3))*scale,titleSize,heading,ink)
    const titleExtra=(titleLines.length-1)*(titleSize+3)*scale
    drawTravelDoodle(page,/yosemite/i.test(trip.destination)?'mountain':'star',right-72*scale,top-56*scale,66*scale,green)
    const dates=trip.start===trip.end?notebookDay(trip.start):`${notebookDay(trip.start)} - ${notebookDay(trip.end)}`
    write(`${dates} / ${trip.travelers} ${trip.travelers===1?'traveler':'travelers'}${continued?' / continued':''}`,left,top-65*scale-titleExtra,12,pen,muted)
    if(trip.presentation)write('DEMO PLAN / check current conditions before you go',left,top-82*scale-titleExtra,8,sans,rust)
    y=top-108*scale-titleExtra
  }
  function room(height:number){if(y-height<oy+105*scale)newPage(true)}
  function paragraph(value:string,font=pen,size=12,indent=0){
    const lines=wrap(clean(value),font,size*scale,width-indent*scale)
    for(const line of lines){room(17*scale);write(line,left+indent*scale,y,size,font);y-=17*scale}
  }
  function section(label:string){room(42*scale);y-=8*scale;write(label,left,y,17,heading,green);y-=27*scale}
  newPage()
  const itinerary=[...(trip.itinerary??[])].sort((a,b)=>`${a.day}${a.time??'99'}`.localeCompare(`${b.day}${b.time??'99'}`))
  let day=''
  for(const stop of itinerary){
    const lines=wrap(clean(stop.title),heading,15*scale,width-48*scale)
    room((39+lines.length*19+(day!==stop.day?31:0))*scale)
    if(day!==stop.day){section(trip.start===trip.end?'The plan':`${notebookDay(stop.day)} / the plan`);day=stop.day}
    drawTravelDoodle(page,stopDoodle(stop.title),left,y-31*scale,30*scale,green)
    write(notebookTime(stop.time),left+46*scale,y,10,bold,rust);y-=19*scale
    for(const line of lines){write(line,left+46*scale,y,15,heading);y-=19*scale}
    y-=15*scale
  }
  if(!itinerary.length){section('The plan');paragraph('A little room for adventure. Add your stops in Tatada and print them here.');y-=10*scale}
  const bookings=trip.bookings
  if(bookings.length){section('Little details to keep');for(const booking of bookings){paragraph(`${booking.simulated?'Sample: ':''}${booking.title} / ${booking.when}`,pen,11);y-=5*scale}}
  const tasks=doc.items.filter(item=>item.tripId===trip.id&&!item.done&&item.kind!=='memory').slice(0,8)
  if(tasks.length){section('Before we go');for(const task of tasks){room(35*scale);page.drawRectangle({x:left,y:y-2*scale,width:7*scale,height:7*scale,borderColor:green,borderWidth:.7*scale});paragraph(task.text,pen,11,17);y-=4*scale}}
  if(y-oy>210*scale){section('Little things to remember');drawTravelDoodle(page,'star',right-21*scale,y+8*scale,15*scale,rust)}
  // Keep a real, useful map link alongside the paper notes, not a non-opening text payload.
  for(const [index,sheet] of pages.entries()){
    page=sheet
    const bottom=oy+27*scale,qsize=58*scale
    page.drawImage(qr,{x:right-qsize,y:bottom,width:qsize,height:qsize})
    page.node.addAnnot(pdf.context.register(pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:[right-qsize,bottom,right,bottom+qsize],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:PDFString.of(qrUrl)}})))
    write(/yosemite/i.test(trip.destination)?'scan for park maps':'scan for a map',right-132*scale,bottom+21*scale,8,pen,muted)
    drawTravelDoodle(page,'star',left,bottom+9*scale,24*scale,green)
    write('tatada',left+30*scale,bottom+17*scale,24,heading,green)
    write('less scrolling. more living.',left+31*scale,bottom+3*scale,8,pen,muted)
    write(`${fmt(doc.printedOn)} / ${index+1}${trip.presentation?' / demo plan':''}`,left,bottom-10*scale,7,sans,muted)
    decorate(page,doc,pen,left,oy+88*scale,width,plan.grayscale)
  }
  await stampStickers(pdf,doc.stickers)
  const originals=pdf.getPageIndices()
  for(let copy=1;copy<plan.repeat;copy++)for(const sheet of await pdf.copyPages(pdf,originals))pdf.addPage(sheet)
  return {bytes:await pdf.save({useObjectStreams:false}),pageCount:pdf.getPageCount(),lossyText:lossy,title}
}

/** A small, cut-out keepsake with a standard QR and a generous quiet zone. */
async function flightPdf(doc: PrintDoc, plan: Pick<PrintPlan, 'pageSize'|'layout'|'grayscale'|'repeat'>): Promise<BuiltPdf> {
  const pdf = await PDFDocument.create(), title = `${doc.trip.destination} / Flights`
  pdf.setTitle(title); pdf.setAuthor('Tatada'); pdf.setCreator('Tatada'); pdf.setProducer('Tatada')
  pdf.setCreationDate(new Date(`${doc.printedOn}T00:00:00Z`)); pdf.setModificationDate(new Date(`${doc.printedOn}T00:00:00Z`))
  const regular = await pdf.embedFont(StandardFonts.TimesRomanItalic), bold = await pdf.embedFont(StandardFonts.TimesRomanBoldItalic)
  const [pw,ph] = SIZES[plan.pageSize], small = plan.layout === '4x6-on-plain'
  const width = small ? 288 : Math.min(492,pw-72), height = small ? 432 : 252, x=(pw-width)/2, top=small?(ph+height)/2:ph-60
  const ink=rgb(.14,.17,.19), muted=rgb(.38,.4,.4), accent=plan.grayscale?muted:rgb(.25,.39,.37)
  const paper=plan.grayscale?rgb(.98,.98,.98):rgb(.99,.97,.92)
  let lossy=false
  const clean=(value:string)=>{const result=printable(value);lossy ||=result.lossy;return result.text}
  const bookings=doc.trip.bookings.filter(b=>b.kind==='flight')
  if (!bookings.length) {
    const page=pdf.addPage([pw,ph]);page.drawText('No flights saved yet.',{x:40,y:ph-70,font:regular,size:14})
  }
  for (const booking of bookings) {
    const page=pdf.addPage([pw,ph]), y=top-height, pad=20
    page.drawRectangle({x,y,width,height,color:paper,borderColor:accent,borderWidth:.75})
    const write=(value:string,xx:number,yy:number,size:number,font=regular,max=width-pad*2)=>{
      const str=clean(value);let fitted=size
      while(font.widthOfTextAtSize(str,fitted)>max && fitted>6) fitted-=.25
      page.drawText(str,{x:xx,y:yy,font,size:fitted,color:ink})
    }
    drawTravelDoodle(page,'plane',x+width-42,top-38,22,accent)
    write('tatada / a little way to go',x+pad,top-24,10,bold)
    write(booking.simulated?'SAMPLE KEEPSAKE':'FLIGHT NOTES',x+pad,top-43,7,regular)
    const route=booking.flight ? `${booking.flight.from}  >  ${booking.flight.to}` : booking.title
    write(route,x+pad,top-86,small?27:36,bold,small?width-40:width-170)
    const lineY=top-104
    for(let xx=x+pad;xx<x+width-pad;xx+=8)page.drawLine({start:{x:xx,y:lineY},end:{x:Math.min(xx+3,x+width-pad),y:lineY},color:accent,thickness:.65})
    write('STAR TRAVELER',x+pad,top-124,7)
    write(doc.profile.name || 'Name not saved',x+pad,top-142,15,bold,small?width-40:width-180)
    write(`${booking.flight?.airline || 'Airline not saved'}  /  ${booking.flight?.number || 'Flight number not saved'}`,x+pad,top-163,11,bold,small?width-40:width-180)
    write(humanWhen(booking.when),x+pad,top-184,9,regular,small?width-40:width-180)
    write(`${doc.trip.travelers} ${doc.trip.travelers===1?'traveler':'travelers'}${booking.ref?`  /  ref ${booking.ref}`:''}`,x+pad,top-201,9,regular,small?width-40:width-180)
    const qr=await pdf.embedPng(await QRCode.toDataURL(flightNotes(booking,doc.trip,doc.profile),{width:360,margin:4,errorCorrectionLevel:'M',color:{dark:'#171d1c',light:'#ffffff'}}))
    const size=small?104:110, qx=small?x+width-pad-size:x+width-pad-size, qy=y+65
    page.drawImage(qr,{x:qx,y:qy,width:size,height:size})
    write('scan your flight notes',qx,qy-10,7,regular,size)
    write(booking.simulated?'Sample journey - not valid for boarding.':'Travel summary - use your airline boarding pass at the airport.',x+pad,y+15,7,regular,width-40)
    decorate(page,doc,regular,x+pad,y+27,width-pad*2,plan.grayscale)
    drawTravelDoodle(page,'star',x,y-23,14,accent)
    page.drawText(`tatada / ${fmt(doc.printedOn)} / cut along the outer line`,{x:x+19,y:y-17,font:regular,size:8,color:muted})
  }
  await stampStickers(pdf,doc.stickers)
  if(plan.repeat>1){const originals=pdf.getPageIndices();for(let n=1;n<plan.repeat;n++)for(const page of await pdf.copyPages(pdf,originals))pdf.addPage(page)}
  return {bytes:await pdf.save({useObjectStreams:false}),pageCount:pdf.getPageCount(),lossyText:lossy,title}
}

/** Only saved data URLs or bundled same-origin assets can become print photos. */
async function embedPhoto(pdf:PDFDocument, source:string|ArrayBuffer) {
  let bytes:Uint8Array
  if(typeof source==='string') {
    if(/^data:image\/(png|jpeg);base64,/.test(source)) bytes=Uint8Array.from(atob(source.split(',')[1]),c=>c.charCodeAt(0))
    else {
      if(typeof document==='undefined')throw Error('Local asset unavailable')
      const asset=new URL(source,document.baseURI)
      if(asset.origin!==location.origin)throw Error('External print image refused')
      const response=await fetch(asset);if(!response.ok)throw Error('Photo unavailable')
      bytes=new Uint8Array(await response.arrayBuffer())
    }
  } else bytes=new Uint8Array(source)
  return bytes[0]===137&&bytes[1]===80 ? pdf.embedPng(bytes) : pdf.embedJpg(bytes)
}

async function bundlePdf(doc:PrintDoc, plan:Pick<PrintPlan,'pageSize'|'layout'|'grayscale'|'repeat'>):Promise<BuiltPdf> {
  const pdf=await PDFDocument.create(),title=`${doc.trip.destination} / All`,date=new Date(`${doc.printedOn}T00:00:00Z`)
  pdf.setTitle(title);pdf.setAuthor('Tatada');pdf.setCreator('Tatada');pdf.setProducer('Tatada');pdf.setCreationDate(date);pdf.setModificationDate(date)
  let lossyText=false
  for(const kind of ['card','flights','hotels','packing','journal'] as const) {
    const built=await buildPdf({...doc,kind,stickers:undefined},{...plan,repeat:1});lossyText ||= built.lossyText
    const part=await PDFDocument.load(built.bytes)
    for(const page of await pdf.copyPages(part,part.getPageIndices()))pdf.addPage(page)
  }
  await stampStickers(pdf,doc.stickers)
  const original=pdf.getPageIndices()
  for(let copy=1;copy<plan.repeat;copy++)for(const page of await pdf.copyPages(pdf,original))pdf.addPage(page)
  return{bytes:await pdf.save({useObjectStreams:false}),pageCount:pdf.getPageCount(),lossyText,title}
}
