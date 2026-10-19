// Isolated trip journey and contextual Fo messaging. No real provider calls.
import assert from 'node:assert/strict'
import {mkdirSync} from 'node:fs'
import {chromium} from 'playwright-core'
import {seed,WARDROBE} from '../src/data/seed.ts'
import {withPresentation} from '../src/data/presentation.ts'
const base=process.env.BASE??'http://127.0.0.1:5180', browser=await chromium.launch({channel:'chrome',headless:true})
mkdirSync('scripts/out',{recursive:true})
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}), errors=[], prepared=[],sent=[],chats=new Map()
 let state=withPresentation(seed(),WARDROBE),version=1
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,body=req.postDataJSON?.bind(req)
  if(path==='/api/status'||path==='/api/session')return route.fulfill({json:{provider:'live',authenticated:true,owner:true,foConnected:true,account:{id:'journey-test',kind:'owner'}}})
  if(path==='/api/workspace'){if(req.method()==='PUT'){state=body().state;version++}return route.fulfill({json:{state,version}})}
  if(path==='/api/actions')return route.fulfill({json:{actions:[]}})
  if(path==='/api/fo/status')return route.fulfill({json:{provider:'live',state:'connected'}})
  if(path==='/api/fo/chats'){
   if(req.method()==='GET')return route.fulfill({json:{chats:[...chats.values()].filter(c=>c.tripId===url.searchParams.get('tripId'))}})
   const chat={id:'chat-'+body().tripId,tripId:body().tripId,status:'idle',turns:[],updatedAt:Date.now()};chats.set(chat.id,chat);return route.fulfill({json:{chat}})
  }
  const m=/^\/api\/fo\/chats\/([^/]+)(?:\/(prepare|send))?$/.exec(path)
  if(m){const c=chats.get(m[1]);if(m[2]==='prepare'){const b=body();prepared.push({tripId:c.tripId,...b});c.pending={text:b.text,message:[b.context,b.text].filter(Boolean).join('\n\n'),hash:'exact-fixture',risk:['fo_authorization']}}
   if(m[2]==='send'){sent.push(c.tripId);c.turns.push({id:'me-'+c.turns.length,role:'me',text:c.pending.message,displayText:c.pending.text,at:Date.now()},{id:'fo-'+c.turns.length,role:'fo',kind:'reply',text:`Fixture Fo: I have your ${c.tripId==='showcase-la'?'LAX':'Yosemite'} trip.`,at:Date.now()});delete c.pending;c.status='idle'}
   return route.fulfill({json:{chat:c}})
  }
  if(path==='/api/intelligence')return route.fulfill({json:{checkedAt:new Date().toISOString(),model:'fixture',searched:true,sections:[{text:'# Stay safe\nKeep the useful numbers handy.',sources:[]}]}})
  return route.fulfill({status:503,json:{error:'Intentionally unavailable in this fixture'}})
 })
 await page.goto(base);await page.locator('.arrival').waitFor({state:'hidden'})
 await page.getByRole('button',{name:'Enter trip mode',exact:true}).click();await page.locator('.flight-keepsake img').first().waitFor()
 await page.waitForTimeout(250);assert.ok(await page.evaluate(()=>window.scrollY)<100,'opening chat does not scroll the page away from the flight')
 const journey=page.getByRole('region',{name:'Your journey'})
 const headings=await journey.locator('.journey-steps > li > header > h3').evaluateAll(headings=>headings.map(h=>h.firstChild.textContent))
 assert.deepEqual(headings,['Your flight','When you land','Drop your bags','Your days, your pace','The way onward'])
 const syncedStage=page.waitForResponse(r=>r.url().endsWith('/api/workspace')&&r.request().method()==='PUT'&&r.request().postDataJSON().state.trips.find(t=>t.id==='showcase-la').journeyDone?.flight===true)
 await journey.getByRole('checkbox',{name:'Complete Your flight',exact:true}).click()
 await page.locator('#showcase-la-stage-flight').waitFor({state:'hidden'});await syncedStage
 assert.match(await page.locator('.journey-stage.current > header > h3').innerText(),/When you land/)
 await page.reload();await page.getByRole('checkbox',{name:'Complete Your flight',exact:true}).waitFor();await page.locator('.arrival').waitFor({state:'hidden'})
 assert.equal(await page.getByRole('checkbox',{name:'Complete Your flight',exact:true}).getAttribute('aria-checked'),'true')
 assert.equal(await page.locator('#showcase-la-stage-flight').isVisible(),false)
 await page.screenshot({path:'scripts/out/journey-completed-stage.png'})
 await page.getByRole('button',{name:'Show Your flight details',exact:true}).click();assert.equal(await page.locator('#showcase-la-stage-flight').isVisible(),true)
 await page.getByRole('checkbox',{name:'Complete Your flight',exact:true}).click();assert.match(await page.locator('.journey-stage.current > header > h3').innerText(),/Your flight/)
 assert.match(await journey.innerText(),/TT 201/);assert.match(await journey.innerText(),/LAX → Little Tokyo/);assert.match(await journey.innerText(),/Little Tokyo stay/)
 const lunch=journey.getByLabel(/12:30Lunch in Downtown LA/)
 await journey.locator('.journey-stop label').first().getByRole('checkbox').check()
 assert.equal(await journey.locator('.journey-stop').first().getAttribute('class'),'journey-stop done')
 const chat=page.getByRole('region',{name:'Fo for LAX'})
 await chat.getByLabel('keep my message in this trip’s journal').check()
 await chat.getByLabel('Message to Fo').fill('We had a lovely lunch today.')
 await chat.getByRole('button',{name:'Send message',exact:true}).click();await chat.getByText('Fixture Fo: I have your LAX trip.',{exact:true}).waitFor()
 assert.equal(prepared[0].tripId,'showcase-la');assert.match(prepared[0].context,/LAX/);assert.match(prepared[0].context,/TT 201/);assert.match(prepared[0].context,/Little Tokyo/);assert.ok(prepared[0].context.length<=500)
 await chat.getByLabel('Message to Fo').fill('What is next today?');await chat.getByRole('button',{name:'Send message',exact:true}).click()
 await page.waitForFunction(()=>document.querySelectorAll('.journey-chat .bubble.tatada').length===2)
 assert.match(prepared[1].context,/LAX/,'context accompanies follow-up messages too')
 assert.doesNotMatch(await chat.locator('.bubble.me').last().innerText(),/Trip context:/,'transport context stays out of the visible user bubble')
 await page.waitForTimeout(900)
 assert.ok(state.trips.find(t=>t.id==='showcase-la').memories.some(m=>m.text==='We had a lovely lunch today.'))
 assert.ok(!state.trips.find(t=>t.id==='showcase-yosemite').memories.some(m=>m.text==='We had a lovely lunch today.'))
 await page.getByRole('button',{name:'Talk to Fo about my flight',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByLabel('Message to Fo').waitFor();assert.match(await modal.getByLabel('Message to Fo').inputValue(),/LAX/);await page.getByRole('button',{name:'Close Magic'}).click()
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'scripts/out/journey-la-first.png'});await page.screenshot({path:'scripts/out/journey-la-full.png',fullPage:true});await page.getByRole('button',{name:'my world',exact:true}).click();await page.getByLabel('Trip mode destination').selectOption('showcase-yosemite');await page.getByRole('button',{name:'Enter trip mode',exact:true}).click()
 const other=page.getByRole('region',{name:'Fo for Yosemite'});await other.getByLabel('Message to Fo').fill('What should I keep in mind?');await other.getByRole('button',{name:'Send message',exact:true}).click();await other.getByText('Fixture Fo: I have your Yosemite trip.',{exact:true}).waitFor()
 assert.equal(prepared.at(-1).tripId,'showcase-yosemite');assert.match(prepared.at(-1).context,/Yosemite/);assert.doesNotMatch(prepared.at(-1).context,/LAX/)
 await page.screenshot({path:'scripts/out/journey-yosemite.png',fullPage:true})
 assert.deepEqual(sent,['showcase-la','showcase-la','showcase-yosemite']);assert.deepEqual(errors,[])
 console.log('Passed: journey order, flight-first viewport, checkable stops, Fo replies, refreshed 500-character trip context, journal capture and trip switching; no real sends.')
}finally{await browser.close()}
