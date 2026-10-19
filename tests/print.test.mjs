import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
const require = createRequire(join(process.env.TATADA_TEST_BUILD, 'package.json'))
const { parsePrintRequest, planPrint, printerAddress, isPrintRequest, EPSON_EMAIL } = require('./print/plan.js')
const { buildPdf, printable } = require('./print/pdf.js')
const { seed } = require('./data/seed.js')
const { PDFDocument } = require('pdf-lib')

const KNOWN = { plainPaper: 'letter', colorInk: 'yes', autoDuplex: 'yes', bodyPrintingOff: 'yes', senderApproved: 'yes' }
const UNKNOWN = { plainPaper: 'unknown', colorInk: 'unknown', autoDuplex: 'unknown', bodyPrintingOff: 'unknown', senderApproved: 'unknown' }

test('natural-language print requests become explicit settings', () => {
  assert.deepEqual(parsePrintRequest('Print in color.'), { color: 'color' })
  assert.deepEqual(parsePrintRequest('Make it 4×6.'), { size: '4x6' })
  assert.deepEqual(parsePrintRequest('Print double-sided.'), { duplex: true })
  assert.deepEqual(parsePrintRequest('Print two copies.'), { copies: 2 })
  assert.deepEqual(parsePrintRequest('print my Lisbon journal in black and white, 3 copies'), { color: 'grayscale', copies: 3, document: 'journal' })
  assert.equal(parsePrintRequest('print it twice on A4').copies, 2)
  assert.equal(parsePrintRequest('single-sided please').duplex, false)
  assert.equal(isPrintRequest('Print the Lisbon trip card'), true)
  assert.equal(isPrintRequest('find a sprint coach'), false)
  assert.ok(EPSON_EMAIL.test('tatada-desk@print.epsonconnect.com'))
  assert.ok(!EPSON_EMAIL.test('me@gmail.com'))
  assert.equal(printerAddress('desk@print.epsonconnect.com', '=+bk+dl'), 'desk=+bk+dl@print.epsonconnect.com')
})

test('documented options apply; unsupported ones are never silently substituted', () => {
  const both = planPrint({ color: 'grayscale', duplex: true }, KNOWN)
  assert.equal(both.suffix, '=+bk+dl'); assert.equal(both.grayscale, true); assert.equal(both.questions.length, 0)
  const four = planPrint({ size: '4x6' }, KNOWN)
  assert.equal(four.questions[0].key, 'fourBySix'); assert.equal(four.layout, 'full')
  assert.equal(planPrint({ size: '4x6' }, KNOWN, { fourBySix: 'layout-on-plain' }).layout, '4x6-on-plain')
  const copies = planPrint({ copies: 2 }, KNOWN)
  assert.equal(copies.questions[0].key, 'copies'); assert.equal(copies.repeat, 1)
  assert.equal(planPrint({ copies: 2 }, KNOWN, { copies: 'repeat-pages' }).repeat, 2)
  assert.equal(planPrint({ copies: 2 }, KNOWN, { copies: 'single' }).repeat, 1)
  assert.equal(planPrint({ duplex: true }, UNKNOWN).questions[0].key, 'duplex', 'unknown duplex hardware asks first')
  assert.equal(planPrint({ duplex: true }, { ...KNOWN, autoDuplex: 'no' }, { duplex: 'single' }).suffix, '')
  assert.equal(planPrint({ duplex: true }, KNOWN, {}, 1).suffix, '', 'one page: nothing to flip')
  assert.equal(planPrint({ color: 'color' }, { ...KNOWN, colorInk: 'no' }).lines.find((l) => l.setting === 'color').how, 'not_possible')
  assert.equal(planPrint({ size: 'a4' }, KNOWN).lines.find((l) => l.setting === 'size').how, 'not_possible')
  assert.equal(planPrint({}, { ...KNOWN, plainPaper: 'a4' }).pageSize, 'a4')
  const unknown = planPrint({}, UNKNOWN)
  assert.ok(unknown.limitations.some((l) => /Print Email Body/.test(l)))
  assert.ok(unknown.limitations.some((l) => /Approved Senders/.test(l)))
  assert.ok(unknown.limitations.some((l) => /Assumed Letter/.test(l)))
  assert.ok(planPrint({}, KNOWN).limitations.some((l) => /isn't proof of a printed page/.test(l)))
})

test('PDFs: white Letter/A4 pages, 4×6 cards on plain paper, disclosed page repetition, safe text', async () => {
  const s = seed(), trip = s.trips.find((t) => t.destination === 'Lisbon')
  const doc = { kind: 'card', trip, items: s.items, profile: s.profile, printedOn: '2026-10-18' }
  const letter = await buildPdf(doc, planPrint({}, KNOWN))
  const parsed = await PDFDocument.load(letter.bytes)
  assert.deepEqual([parsed.getPage(0).getWidth(), parsed.getPage(0).getHeight()], [612, 792])
  assert.equal(letter.pageCount, parsed.getPageCount())
  assert.equal(String.fromCharCode(...letter.bytes.slice(0, 5)), '%PDF-')
  assert.ok(Buffer.from(letter.bytes).toString('latin1').includes('/Subtype /Image'), 'the trip card keeps its QR summary')
  const a4 = await PDFDocument.load((await buildPdf(doc, planPrint({}, { ...KNOWN, plainPaper: 'a4' }))).bytes)
  assert.ok(Math.abs(a4.getPage(0).getWidth() - 595.28) < 1)
  const card = await buildPdf(doc, planPrint({ size: '4x6' }, KNOWN, { fourBySix: 'layout-on-plain' }))
  assert.equal((await PDFDocument.load(card.bytes)).getPage(0).getWidth(), 612, 'the card sits on the plain sheet Epson will use')
  const three = await buildPdf(doc, planPrint({ copies: 3 }, KNOWN, { copies: 'repeat-pages' }))
  assert.equal(three.pageCount, letter.pageCount * 3)
  const again = await buildPdf(doc, planPrint({}, KNOWN))
  assert.deepEqual(Buffer.from(again.bytes), Buffer.from(letter.bytes), 'same input, same bytes')
  const journal = await buildPdf({ ...doc, kind: 'journal' }, planPrint({ color: 'grayscale' }, KNOWN))
  assert.match(journal.title, /journal/)
  assert.deepEqual(printable('São Paulo café'), { text: 'São Paulo café', lossy: false })
  assert.deepEqual(printable('Kraków ✨'), { text: 'Kraków ', lossy: false }, 'Latin-1 kept, emoji dropped')
  assert.deepEqual(printable('Łódź'), { text: '?ódz', lossy: true }, 'transliterate where possible, report the rest')
  assert.deepEqual(printable('東京'), { text: '??', lossy: true })
  assert.deepEqual(printable('SFO → LIS'), { text: 'SFO -> LIS', lossy: false })
})

test('category print requests keep flight and hotel documents distinct', async () => {
  assert.equal(parsePrintRequest('Print my flights in color').document, 'flights')
  assert.equal(parsePrintRequest('Print just my hotel').document, 'hotels')
  const state = seed(), trip = state.trips[0]
  trip.bookings = [
    {id:'out',kind:'flight',title:'SFO → SYD',when:'Aug 7',detail:'Two travelers',ref:'FLIGHT-ONLY',simulated:false},
    {id:'stay',kind:'stay',title:'Surry Hills stay',when:'Aug 7–9',detail:'Room for two',ref:'HOTEL-ONLY',simulated:false},
    {id:'back',kind:'flight',title:'SYD → SFO',when:'Aug 9',detail:'Two travelers',ref:'RETURN-ONLY',simulated:false},
  ]
  const common = {trip, items:state.items, profile:state.profile, printedOn:'2026-10-18'}
  const flights = await buildPdf({...common, kind:'flights'}, planPrint({}, KNOWN))
  const hotels = await buildPdf({...common, kind:'hotels'}, planPrint({}, KNOWN))
  assert.equal(flights.pageCount, 2, 'each flight gets its own page')
  assert.equal(hotels.pageCount, 1)
  assert.match(flights.title, /Flights/); assert.match(hotels.title, /Stay/)
  assert.ok(Buffer.from(flights.bytes).toString('latin1').includes('/Subtype /Image'), 'each flight now has its own QR')
})

test('flight QR includes the saved flight identity and excludes unrelated private data',()=>{
 const {flightNotes}=require('./print/flight.js')
 const state=seed(),trip=state.trips[0]
 trip.localAddress='PRIVATE HOTEL ADDRESS'
 const booking={id:'out',kind:'flight',title:'SFO to SYD',when:'Aug 7',ref:'',detail:'',simulated:true,flight:{airline:'Tatada Air',number:'TT 108',from:'SFO',to:'SYD'}}
 const notes=flightNotes(booking,trip,{...state.profile,name:'Jayasri'})
 assert.match(notes,/Jayasri/);assert.match(notes,/Tatada Air/);assert.match(notes,/TT 108/);assert.match(notes,/NOT A BOARDING PASS/)
 assert.ok(!notes.includes(trip.localAddress));assert.ok(!notes.includes('undefined'))
})

test('packing PDFs include saved clothes and packing tasks, without mixing bookings',async()=>{
 const state=seed(),trip=state.trips[0]
 const built=await buildPdf({kind:'packing',trip,profile:state.profile,items:[{id:'pack',tripId:trip.id,kind:'pack',phase:'prepare',done:true,text:'Pack: Blue shirt'}],packing:[{name:'Blue shirt',category:'top'},{name:'Walking shoes',category:'shoes'}],printedOn:'2026-10-18'},planPrint({},KNOWN))
 assert.match(built.title,/Packing/);assert.ok(built.pageCount>0)
 assert.equal(parsePrintRequest('print my packing list').document,'packing')
 assert.equal(parsePrintRequest('print packing in black and white').color,'grayscale')
})

test('explicit mail changes keep From separate from the Epson destination and never treat them as authorization',()=>{
 const {parsePrintMail}=require('./print/plan.js')
 assert.deepEqual(parsePrintMail('Print my flights from star@example.test to desk@print.epsonconnect.com'),{from:'star@example.test',to:'desk@print.epsonconnect.com'})
 assert.deepEqual(parsePrintMail('Print two copies in color'),{})
 assert.deepEqual(parsePrintMail('Print to someone@example.test'),{to:'someone@example.test'}) // The editor must reject this as a printer destination, not silently use the old printer.
})

test('All bundles document sections in order and repeats the whole bundle',async()=>{
 const state=seed(),trip=state.trips[0],plan=planPrint({},KNOWN),doc={kind:'all',trip,profile:state.profile,items:state.items,printedOn:'2026-10-19'}
 const parts=await Promise.all(['card','flights','hotels','packing','journal'].map(kind=>buildPdf({...doc,kind},plan)))
 const combined=await buildPdf(doc,plan), pdf=await PDFDocument.load(combined.bytes)
 assert.equal(pdf.getTitle(),`${trip.destination} / All`)
 assert.equal(combined.pageCount,parts.reduce((n,p)=>n+p.pageCount,0))
 const twice=await buildPdf(doc,{...plan,repeat:2});assert.equal(twice.pageCount,combined.pageCount*2)
 assert.equal(parsePrintRequest('Print everything for my trip').document,'all')
 assert.equal(parsePrintRequest('print all in color').document,'all')
})

test('packing PDFs embed saved outfit photos and paginate long outfit collections',async()=>{
 const state=seed(),trip=state.trips[0],png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
 const outfits=Array.from({length:8},(_,i)=>({name:`Outfit ${i+1}`,pieces:[{name:'My saved shirt',image:png},{name:'No photo yet'}]}))
 const built=await buildPdf({kind:'packing',trip,profile:state.profile,items:[],packingOutfits:outfits,printedOn:'2026-10-19'},planPrint({},KNOWN))
 assert.ok(built.pageCount>1)
 const raw=Buffer.from(built.bytes).toString('latin1');assert.match(raw,/\/Subtype \/Image/)
})
