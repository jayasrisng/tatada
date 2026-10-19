// Real UI with isolated account/provider APIs. No booking, message or print delivery.
import assert from 'node:assert/strict'
import {mkdirSync} from 'node:fs'
import {chromium} from 'playwright-core'
import {seed,WARDROBE} from '../src/data/seed.ts'
import {withPresentation} from '../src/data/presentation.ts'
const base=process.env.BASE??'http://127.0.0.1:5180',browser=await chromium.launch({channel:'chrome',headless:true})
mkdirSync('scripts/out/polish',{recursive:true})
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],externalWrites=[]
 let state=withPresentation(seed(),WARDROBE),version=1
 page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR:',e.message)})
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname
  if(req.method()!=='GET'&&path!=='/api/workspace'&&path!=='/api/intelligence'&&path!=='/api/session')externalWrites.push(path)
  if(path==='/api/status'||path==='/api/session')return route.fulfill({json:{provider:'live',authenticated:true,owner:true,foConnected:true,account:{id:'editing-fixture',kind:'owner'}}})
  if(path==='/api/workspace'){if(req.method()==='PUT'){state=req.postDataJSON().state;version++}return route.fulfill({json:{state,version}})}
  if(path==='/api/actions')return route.fulfill({json:{actions:[]}})
  if(path==='/api/fo/status')return route.fulfill({json:{provider:'live',state:'connected'}})
  if(path==='/api/fo/chats')return route.fulfill({json:{chats:[]}})
  if(path==='/api/intelligence')return route.fulfill({json:{checkedAt:new Date().toISOString(),model:'fixture',searched:false,sections:[{text:'Fixture outfit from your own closet.',sources:[]}]}})
  if(path==='/api/print/printer')return route.fulfill({json:{printer:null}})
  if(path==='/api/print/sender')return route.fulfill({json:{sender:null}})
  if(path==='/api/print/jobs')return route.fulfill({json:{jobs:[]}})
  if(path==='/api/gmail/status')return route.fulfill({json:{configured:false,connected:false}})
  return route.fulfill({status:503,json:{error:'Unavailable in this isolated fixture'}})
 })
 let forecasts=0
 await page.route('https://api.open-meteo.com/**',route=>{forecasts++;return route.fulfill({json:{current:{time:Math.floor(Date.now()/1000),temperature_2m:55,weather_code:3},daily:{temperature_2m_max:[63],temperature_2m_min:[49]}}})})
 await page.goto(base+'/#/');await page.locator('.arrival').waitFor({state:'hidden'});assert.equal(forecasts,0);assert.equal(await page.getByText('San Francisco',{exact:true}).count(),0)
 await page.getByRole('button',{name:'Your profile'}).click();await page.getByText('55°F · Overcast',{exact:true}).waitFor();assert.equal(await page.getByText(/Today · High/).count(),0);assert.equal(await page.getByText('Weather sources',{exact:true}).count(),0)
 await page.getByRole('button',{name:'Close profile'}).click();await page.getByRole('button',{name:'Your profile'}).click();await page.getByText('55°F · Overcast',{exact:true}).waitFor();assert.equal(forecasts,2)
 await page.screenshot({path:'scripts/out/polish/profile.png'})
 await page.getByRole('button',{name:'Close profile'}).click()
 const expected=state.items.filter(i=>!i.done).length
 assert.equal(await page.locator('.tabbar .dot').innerText(),String(expected))
 await page.goto(base+'/#/tasks');await page.getByRole('group',{name:'Tasks for'}).getByRole('button',{name:'Common',exact:true}).waitFor()
 await page.goto(base+'/#/trips');await page.locator('.trip-card.new').waitFor();assert.equal(await page.locator('.trip-list').evaluate(el=>el.firstElementChild.classList.contains('new')),true)
 await page.goto(base+'/#/welcome');await page.getByText('Your space, Jayasri.',{exact:true}).waitFor();assert.equal(await page.getByText('Your details, connections and saved files.',{exact:true}).count(),0)
 await page.goto(base+'/#/trip/showcase-sydney/notebook');await page.getByRole('button',{name:'print flights',exact:true}).click()
 const dialog=page.getByRole('dialog');await dialog.getByRole('link',{name:'Download PDF'}).waitFor()
 assert.equal(await dialog.locator('.print-decoration').getAttribute('open'),'');await dialog.getByRole('button',{name:'Add ⭐ sticker',exact:true}).waitFor();await dialog.getByRole('button',{name:'Add ⭐ sticker',exact:true}).click()
 const sticker=dialog.getByRole('button',{name:'Move ⭐ sticker',exact:true});await sticker.waitFor();const initial=await sticker.boundingBox();const board=await dialog.locator('.sticker-board').boundingBox()
 await page.mouse.move(initial.x+initial.width/2,initial.y+initial.height/2);await page.mouse.down();await page.mouse.move(board.x+board.width*.84,board.y+board.height*.36,{steps:6});await page.mouse.up()
 const moved=await sticker.boundingBox();assert.ok(Math.abs((moved.x+moved.width/2)-(board.x+board.width*.84))<3)
 await sticker.focus();await page.keyboard.press('ArrowRight');const keyed=await sticker.boundingBox();assert.ok(keyed.x>moved.x)
 await dialog.getByLabel('Keepsake caption').fill('A little journey. A big memory.');await page.waitForTimeout(700)
 await dialog.getByRole('button',{name:'Next print page',exact:true}).click();await dialog.getByRole('button',{name:'Add 💛 sticker',exact:true}).click();const heart=dialog.getByRole('button',{name:'Move 💛 sticker',exact:true});const h=await heart.boundingBox(),b2=await dialog.locator('.sticker-board').boundingBox();await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(b2.x+b2.width*.84,b2.y+b2.height*.36,{steps:4});await page.mouse.up();await page.waitForTimeout(500)
 const bytes=await dialog.getByRole('link',{name:'Download PDF'}).evaluate(async el=>Array.from(new Uint8Array(await(await fetch(el.href)).arrayBuffer())))
 const {writeFileSync}=await import('node:fs');writeFileSync('scripts/out/polish/decorated-flight.pdf',Buffer.from(bytes))
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.screenshot({path:'scripts/out/polish/print-controls.png',fullPage:true})
 const packing=await page.evaluate(async state=>{const {buildPdf}=await import('/src/print/pdf.ts');const doc={kind:'packing',trip:state.trips.find(t=>t.id==='showcase-la'),items:state.items,profile:state.profile,printedOn:'2026-10-18',decoration:'sun',caption:'Sunshine and a suitcase.'};return Array.from((await buildPdf(doc,{pageSize:'letter',layout:'4x6-on-plain',grayscale:false,repeat:1})).bytes)},state)
 writeFileSync('scripts/out/polish/decorated-packing.pdf',Buffer.from(packing))
 const lax=state.trips.find(t=>t.id==='showcase-la');assert.equal(lax.destination,'LAX');assert.equal(lax.start,'2026-10-19');assert.equal(lax.end,'2026-10-25');assert.equal(new Set(lax.itinerary.map(i=>i.day)).size,7)
 await page.goto(base+'/#/trip/showcase-la/notebook');await page.getByText('Check-in opens 24 hours before departure.',{exact:true}).waitFor();assert.equal(await page.locator('.flight-keepsake').last().locator('img').count(),0)
 const laxPdf=await page.evaluate(async state=>{const{buildPdf}=await import('/src/print/pdf.ts');return Array.from((await buildPdf({kind:'flights',trip:state.trips.find(t=>t.id==='showcase-la'),items:state.items,profile:state.profile,printedOn:'2026-10-18'},{pageSize:'letter',layout:'full-page',grayscale:false,repeat:1})).bytes)},state);writeFileSync('scripts/out/polish/lax-flights.pdf',Buffer.from(laxPdf))
 await page.goto(base+'/#/welcome');await page.route('https://api.open-meteo.com/**',route=>route.fulfill({status:503,body:'Unavailable'}));await page.reload();await page.getByText('Weather unavailable',{exact:true}).waitFor();assert.equal(await page.getByText('55°F · Overcast',{exact:true}).count(),0)
 assert.deepEqual(errors,[]);assert.deepEqual(externalWrites,[])
 console.log('Passed: new-trip ordering, Common tasks, complete pending count, profile copy removal, profile-only forecast loading/reopen/failure, dragged sticker export/caption, flight and packing PDFs. No provider sends.')
}finally{await browser.close()}
