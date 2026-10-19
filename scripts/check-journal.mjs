// Isolated photo-to-journal and print regression. No provider requests or print delivery.
import assert from 'node:assert/strict'
import {mkdirSync, writeFileSync} from 'node:fs'
import {chromium} from 'playwright-core'
import {seed, WARDROBE} from '../src/data/seed.ts'
import {withPresentation} from '../src/data/presentation.ts'
const base=process.env.BASE??'http://127.0.0.1:5180'
mkdirSync('scripts/out/journal',{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const page=await browser.newPage({viewport:{width:390,height:844}}), errors=[]
 let state=withPresentation(seed(),WARDROBE), version=1, printSubmissions=0
 const sydney=state.trips.find(t=>t.id==='showcase-sydney')
 assert.equal(sydney.travelers,2);assert.equal(sydney.memories.length,8);assert.equal(sydney.itinerary.length,17)
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/api/**',async route=>{
  const req=route.request(), path=new URL(req.url()).pathname
  if(path==='/api/print/jobs'&&req.method()==='POST')printSubmissions++
  if(path==='/api/status'||path==='/api/session')return route.fulfill({json:{provider:'live',authenticated:true,owner:true,foConnected:true,account:{id:'journal-fixture',kind:'owner'}}})
  if(path==='/api/workspace'){if(req.method()==='PUT'){state=req.postDataJSON().state;version++}return route.fulfill({json:{state,version}})}
  if(path==='/api/fo/status')return route.fulfill({json:{provider:'live',state:'connected'}})
  if(path==='/api/fo/chats')return route.fulfill({json:{chats:[]}})
  if(path==='/api/actions')return route.fulfill({json:{actions:[]}})
  if(path==='/api/gmail/status')return route.fulfill({json:{configured:false,connected:false}})
  if(path==='/api/intelligence')return route.fulfill({json:{checkedAt:new Date().toISOString(),model:'fixture',searched:true,sections:[{text:'# Stay safe\nCheck the trail before you leave. Weather can change fast.\n\n# Getting around\nGive yourself time for the bus.\n\n# Phone and money\nSave your address offline.\n\n# Local manners\nKeep paths clear for everyone.\n\n# A little wonder\nThere is always more to notice.',sources:[{url:'https://example.test/official',title:'Fixture source'}]}]}})
  return route.fulfill({status:503,json:{error:'Intentionally unavailable in isolated fixture'}})
 })
 await page.goto(base+'/#/trip/showcase-sydney/journal');await page.locator('.arrival').waitFor({state:'hidden'})
 await page.getByLabel('Moment note').fill('Lunch here was so good. We shared everything.')
 await page.getByLabel('When',{exact:true}).fill('2026-08-08')
 await page.getByLabel('Where (optional)',{exact:true}).fill('Manly lunch')
 // Make an obviously synthetic test image; no external or personal photo is used.
 const jpeg=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=260;const x=c.getContext('2d');x.fillStyle='#c6d8c2';x.fillRect(0,0,400,260);x.fillStyle='#222';x.font='24px sans-serif';x.fillText('Journal test image',60,135);return c.toDataURL('image/jpeg')})
 await page.getByLabel('Add a photo',{exact:true}).setInputFiles({name:'journal-test.jpg',mimeType:'image/jpeg',buffer:Buffer.from(jpeg.split(',')[1],'base64')})
 await page.locator('.moment-preview img').waitFor();const synced=page.waitForResponse(r=>r.url().endsWith('/api/workspace')&&r.request().method()==='PUT'&&r.request().postDataJSON().state.trips.find(t=>t.id==='showcase-sydney').memories.some(m=>m.place==='Manly lunch'));await page.getByRole('button',{name:'save moment',exact:true}).click()
 await page.getByRole('status').filter({hasText:'Saved to your journal.'}).waitFor()
 await page.waitForFunction(()=>document.querySelectorAll('.memory-pic img').length===1)
 await synced
 assert.equal(state.trips.find(t=>t.id===sydney.id).memories.at(-1).day,'2026-08-08')
 await page.reload();await page.locator('.memory-pic img').waitFor();assert.equal(await page.locator('.memory-pic img').count(),1)
 await page.screenshot({path:'scripts/out/journal/capture-dark.png',fullPage:true})
 await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.screenshot({path:'scripts/out/journal/capture-light.png',fullPage:true})
 const trip=state.trips.find(t=>t.id===sydney.id)
 for(const kind of ['flights','hotels','journal','packing','all']){
  const result=await page.evaluate(async ({kind,trip,profile,wardrobe})=>{const {buildPdf}=await import('/src/print/pdf.ts');const pdf=await buildPdf({kind,trip,profile,packing:wardrobe.slice(0,3),packingOutfits:[{name:'Outfit 1 / Harbour walk',pieces:wardrobe.slice(0,3)}],items:[],printedOn:'2026-10-18'},{pageSize:'letter',layout:'full',grayscale:false,repeat:1});return {bytes:Array.from(pdf.bytes),pageCount:pdf.pageCount}}, {kind,trip,profile:state.profile,wardrobe:['top','bottom','shoes'].map(category=>WARDROBE.find(g=>g.category===category)).filter(Boolean)})
  writeFileSync(`scripts/out/journal/sydney-${kind}.pdf`,Buffer.from(result.bytes))
  assert.ok(result.pageCount>0);if(kind==='flights')assert.equal(result.pageCount,2)
 }
 await page.goto(base+'/#/trip/showcase-sydney/notebook');await page.locator('.flight-keepsake img').first().waitFor()
 assert.equal(await page.locator('.flight-keepsake').count(),2)
 assert.match(await page.locator('.flight-keepsake').first().innerText(),/Tatada Air[\s\S]*TT 108/)
 const notebookUrl=page.url()
 await page.getByRole('button',{name:'print flights',exact:true}).click()
 await page.getByRole('dialog',{name:'Print from notebook'}).waitFor()
 await page.getByRole('dialog').getByRole('link',{name:'Download PDF'}).waitFor()
 const designHeader=page.getByRole('dialog').locator('.print-design-header');assert.equal(await designHeader.getByRole('button',{name:'Print',exact:true}).count(),1)
 const caption=page.getByRole('dialog').getByLabel('Keepsake caption');assert.equal(await caption.getAttribute('placeholder'),'Write a caption here…');await caption.fill('A');assert.equal(await caption.evaluate(el=>el.matches(':placeholder-shown')),false)
 assert.equal(await page.getByRole('dialog').getByRole('button',{name:'all',exact:true}).count(),1)
 assert.equal(page.url(),notebookUrl,'printing previews inline without changing the notebook route')
 assert.equal(printSubmissions,0,'opening the preview never prepares or submits a real job')
 await page.getByRole('dialog').getByRole('button',{name:'Add ⭐ sticker',exact:true}).waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('.sticker-tray button')?.disabled);await page.screenshot({path:'scripts/out/journal/notebook-print.png',fullPage:true})
 await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'})
 assert.equal(await page.getByRole('tab',{name:'Flights',exact:true}).getAttribute('aria-selected'),'true')
 await page.getByRole('tab',{name:'Stay',exact:true}).click();await page.getByRole('tab',{name:'Flights',exact:true}).click()
 assert.equal(page.url(),notebookUrl)
 await page.screenshot({path:'scripts/out/journal/notebook-ticket.png',fullPage:true})
 await page.goto(base+'/#/trip/showcase-sydney/journal');assert.equal(await page.locator('.journal-illustration img').count(),2)
 for(const img of await page.locator('.journal-illustration img').all()){await img.scrollIntoViewIfNeeded();await img.evaluate(i=>i.decode());assert.ok(await img.evaluate(i=>i.naturalWidth>0))}
 await page.screenshot({path:'scripts/out/journal/illustrated-memories.png',fullPage:true})
 await page.goto(base+'/#/trip/showcase-yosemite');await page.locator('.brief-bite').first().waitFor();assert.equal(await page.locator('.brief-bite').count(),5)
 assert.equal(await page.getByText('A little more',{exact:true}).count(),0)
 assert.equal(await page.getByText('Full briefing',{exact:true}).count(),0)
 await page.locator('.brief-bite').first().getByText(/Weather can change fast/).waitFor({state:'visible'})
 await page.screenshot({path:'scripts/out/journal/briefing.png',fullPage:true})
 await page.goto(base+'/#/trip/showcase-sydney/print/flights');await page.getByRole('button',{name:'flights',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'flights',exact:true}).getAttribute('aria-pressed'),'true')
 assert.deepEqual(errors,[])
 console.log('Passed: two-person Sydney, photo+caption journal persistence after reload, five compact briefing cards, flight-only route, five real PDF artifacts including photo packing and the combined bundle; no provider calls or printing.')
} finally {await browser.close()}
