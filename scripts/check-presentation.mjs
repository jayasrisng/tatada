// Browser regression with isolated account state and all provider calls intercepted.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { seed, WARDROBE } from '../src/data/seed.ts'
import { withPresentation } from '../src/data/presentation.ts'
const base=process.env.BASE??'http://127.0.0.1:5180'
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const context=await browser.newContext({viewport:{width:390,height:844}}), page=await context.newPage(), errors=[], intelligence=[]
 page.setDefaultTimeout(20000)
 let state=withPresentation(seed(),WARDROBE), version=0
 assert.equal(state.trips.filter(t=>t.status==='past').length,6)
 assert.deepEqual(state.trips.filter(t=>t.status!=='past').map(t=>t.destination),['LAX','Yosemite'])
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname,method=request.method()
  if(path==='/api/status'||path==='/api/session')return route.fulfill({json:{provider:'live',authenticated:true,owner:true,foConnected:true,account:{id:'presentation-test',kind:'owner'}}})
  if(path==='/api/workspace'){if(method==='PUT'){state=request.postDataJSON().state;version++}return route.fulfill({json:{state,version}})}
  if(path==='/api/intelligence'){const body=request.postDataJSON();intelligence.push(body);return route.fulfill({json:{checkedAt:new Date().toISOString(),model:'fixture-only',searched:false,incomplete:false,sections:[{text:body.purpose==='style'?'Fixture: try the supplied white knit crop top with straight blue jeans.':'Fixture briefing: conditions have not been verified. Keep the sights a surprise.',sources:[]}]}})}
  if(path==='/api/fo/status')return route.fulfill({json:{provider:'live',state:'connected'}})
  if(path==='/api/fo/chats')return route.fulfill({json:{chats:[]}})
  if(path==='/api/gmail/status')return route.fulfill({json:{configured:false,connected:false}})
  if(path==='/api/actions')return route.fulfill({json:{actions:[]}})
  return route.fulfill({status:503,json:{error:'Intentionally unavailable in this isolated fixture'}})
 })
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto(base);await page.locator('.arrival').waitFor({state:'hidden'});await page.locator('.wm-land path.visited').first().waitFor()
 assert.equal(await page.locator('.wm-land path.visited').count(),6)
 await page.getByRole('button',{name:'Enter trip mode',exact:true}).click();await page.getByRole('heading',{name:'LAX. Your next chapter.',exact:true}).waitFor()
 await page.getByRole('region',{name:'LAX area map',exact:true}).waitFor();assert.match(await page.locator('.area-map svg').getAttribute('aria-label'),/34.0522, -118.2437/);assert.equal(await page.locator('.trip-nav > button').count(),3);await page.reload();await page.getByRole('region',{name:'LAX area map',exact:true}).waitFor()
 assert.equal(await page.locator('.wm-land path.visited').count(),0)
 await page.screenshot({path:'scripts/out/presentation-trip-mode.png',fullPage:true})
 await page.getByRole('button',{name:'Trip menu',exact:true}).click();await page.getByRole('group',{name:'Trip sections',exact:true}).getByRole('button',{name:'Tasks',exact:true}).click()
 assert.equal(await page.getByRole('button',{name:'Today',exact:true}).count(),0)
 assert.equal(await page.getByRole('group',{name:'Tasks for'}).getByRole('button',{name:'LAX',exact:true}).getAttribute('aria-pressed'),'true')
 await page.getByRole('button',{name:'Trip menu',exact:true}).click();await page.getByRole('group',{name:'Trip sections',exact:true}).getByRole('button',{name:'Closet',exact:true}).click()
 assert.equal(await page.getByRole('region',{name:'Dress for your day',exact:true}).count(),0)
 await page.getByRole('button',{name:'Ask Magic',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Today',exact:true}).count(),0);await page.getByRole('button',{name:'Close Magic'}).click()
 await page.getByRole('navigation',{name:'Main'}).getByRole('button',{name:'Home',exact:true}).click();await page.getByRole('button',{name:'my world',exact:true}).click()
 await page.getByRole('navigation',{name:'Main'}).getByRole('button',{name:/^Tasks/}).click();await page.getByRole('button',{name:'Common',exact:true}).waitFor()
 assert.match(await page.locator('.checklist').first().innerText(),/Renew Global Entry/)
 assert.doesNotMatch(await page.locator('.checklist').first().innerText(),/Choose transport/)
 await page.getByRole('group',{name:'Tasks for'}).getByRole('button',{name:'Yosemite',exact:true}).click()
 assert.match(await page.locator('.checklist').first().innerText(),/Pack layers/)
 await page.getByRole('navigation',{name:'Main'}).getByRole('button',{name:'Home',exact:true}).click();await page.getByRole('button',{name:'Your profile'}).click();await page.getByRole('button',{name:'Close profile',exact:true}).click();await page.getByRole('heading',{level:1}).waitFor()
 await page.getByRole('navigation',{name:'Main'}).getByRole('button',{name:'Closet',exact:true}).click()
 await page.getByLabel('Today outfit plans').fill('Office then a birthday dinner. Skip my white sweater; it is in the wash.')
 await page.getByRole('button',{name:'style my day',exact:true}).click();await page.getByText('Fixture: try the supplied white knit crop top with straight blue jeans.',{exact:true}).waitFor()
 const styling=intelligence.find(q=>q.purpose==='style');assert.ok(styling);assert.match(styling.context,/White fuzzy sweater/);assert.doesNotMatch(styling.context,/data:image|\/wardrobe\//)
 await page.goto(base+'/#/trip/showcase-yosemite');await page.getByText(/Fixture briefing: conditions have not been verified/).waitFor()
 assert.equal(await page.getByRole('button',{name:'research this',exact:true}).count(),0)
 assert.equal(intelligence.filter(q=>!q.purpose && q.context.startsWith('Yosemite')).length,1)
 assert.deepEqual(errors,[])
 console.log('Passed: presentation profile with six visited countries, upcoming LAX/Yosemite, scoped trip mode and map zoom, everyday/trip tasks, profile close, closet-grounded Today chat, automatic deduplicated briefing; no real provider actions.')
}finally{await browser.close()}
