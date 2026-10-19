// Real UI with isolated account/provider APIs. No booking, message or print delivery.
import assert from 'node:assert/strict'
import {mkdirSync} from 'node:fs'
import {chromium} from 'playwright-core'
import {seed,WARDROBE} from '../src/data/seed.ts'
import {withPresentation} from '../src/data/presentation.ts'
const base=process.env.BASE??'http://127.0.0.1:5180',browser=await chromium.launch({channel:'chrome',headless:true})
mkdirSync('scripts/out/consistency',{recursive:true})
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],externalWrites=[]
 let state=withPresentation(seed(),WARDROBE),version=1
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname
  if(req.method()!=='GET'&&path!=='/api/workspace'&&path!=='/api/intelligence'&&path!=='/api/session')externalWrites.push(path)
  if(path==='/api/status'||path==='/api/session')return route.fulfill({json:{provider:'live',authenticated:true,owner:true,foConnected:true,account:{id:'editing-fixture',kind:'owner'}}})
  if(path==='/api/workspace'){if(req.method()==='PUT'){state=req.postDataJSON().state;version++}return route.fulfill({json:{state,version}})}
  if(path==='/api/actions')return route.fulfill({json:{actions:[]}})
  if(path==='/api/fo/status')return route.fulfill({json:{provider:'live',state:'connected'}})
  if(path==='/api/fo/chats')return route.fulfill({json:{chats:[]}})
  if(path==='/api/intelligence')return route.fulfill({json:{checkedAt:new Date().toISOString(),model:'fixture',searched:false,sections:[{text:'Fixture outfit from your own closet.',sources:[]}]}})
  if(path==='/api/gmail/status')return route.fulfill({json:{configured:false,connected:false}})
  return route.fulfill({status:503,json:{error:'Unavailable in this isolated fixture'}})
 })
 await page.goto(base+'/#/style');await page.locator('.arrival').waitFor({state:'hidden'})
 const style=page.getByRole('group',{name:'Closet for'});await style.waitFor()
 assert.deepEqual(await style.getByRole('button').allTextContents(),['Today','LAX','Yosemite'])
 assert.equal(await page.locator('.style-composer').getByRole('button',{name:'Dictate your request'}).count(),1)
 assert.equal(await page.locator('.style-composer').getByRole('button',{name:'style my day'}).count(),1)
 assert.equal(await page.getByText(/Claude uses your plans/).count(),0)
 await page.getByLabel('Today outfit plans').fill('Office then a birthday.');await page.getByRole('button',{name:'style my day'}).click();await page.getByText('Fixture outfit from your own closet.',{exact:true}).waitFor()
 await page.screenshot({path:'scripts/out/consistency/style.png',fullPage:true})
 await page.goto(base+'/#/tasks');const tasks=page.getByRole('group',{name:'Tasks for'});await tasks.waitFor()
 assert.deepEqual(await tasks.getByRole('button').allTextContents(),['Common','LAX','Yosemite']);await tasks.getByRole('button',{name:'LAX',exact:true}).click();assert.match(await page.locator('.checklist').first().innerText(),/Choose transport/)
 await page.goto(base+'/#/trip/showcase-sydney/notebook');await page.getByText('Add or edit flights',{exact:true}).click();await page.getByRole('button',{name:'add flight',exact:true}).click()
 let form=page.getByRole('form',{name:'Travel detail editor'})
 await form.getByLabel('From',{exact:true}).fill('SFO');await form.getByLabel('To',{exact:true}).fill('MEL');await form.getByLabel('Airline (optional)').fill('My Airline');await form.getByLabel('Flight number (optional)').fill('MA 101');await form.getByLabel('Date',{exact:true}).fill('2026-08-09');await form.getByLabel('Time (optional)').fill('15:00');await form.getByLabel('Confirmation / reference (optional)').fill('PRIVATE-REF')
 const synced=page.waitForResponse(r=>r.url().endsWith('/api/workspace')&&r.request().method()==='PUT'&&r.request().postDataJSON().state.trips.find(t=>t.id==='showcase-sydney').bookings.some(b=>b.flight?.number==='MA 101'))
 await form.getByRole('button',{name:'save details'}).click();await synced;await page.reload();await page.locator('.flight-keepsake').filter({hasText:'MA 101'}).waitFor()
 await page.getByText('Add or edit flights',{exact:true}).click();let row=page.locator('.arrangement-row').filter({hasText:'SFO → MEL'});await row.getByRole('button',{name:'edit',exact:true}).click();form=page.getByRole('form',{name:'Travel detail editor'});await form.getByLabel('Notes (optional)').fill('Corrected note');await form.getByRole('button',{name:'save details'}).click();await page.locator('.flight-keepsake').filter({hasText:'MA 101'}).waitFor()
 await row.getByRole('button',{name:'Remove SFO → MEL',exact:true}).click();assert.equal(await page.locator('.flight-keepsake').filter({hasText:'MA 101'}).count(),0);await page.getByRole('button',{name:'undo',exact:true}).click();await page.locator('.flight-keepsake').filter({hasText:'MA 101'}).waitFor()
 for(const [tab,summary,add,name] of [['Stay','Add or edit your stay','add stay','Harbour room'],['Getting around','Add or edit transport','add getting around','Station pickup'],['Eat','Add or edit meals','add meal','A shared lunch']]){
  await page.getByRole('tab',{name:tab,exact:true}).click();await page.getByText(summary,{exact:true}).click();await page.getByRole('button',{name:add,exact:true}).click();form=page.getByRole('form',{name:'Travel detail editor'});await form.getByLabel('Name',{exact:true}).fill(name);await form.getByRole('button',{name:'save details'}).click();await page.getByRole('region',{name:'Saved arrangements',exact:true}).getByText(name,{exact:true}).waitFor()
 }
 await page.goto(base+'/#/trip/showcase-sydney/journal');let moment=page.locator('.memory:has(.journal-illustration)').first();await moment.locator('img').waitFor();const original=await moment.locator('img').getAttribute('src');await moment.getByRole('button',{name:'edit moment'}).click();let editor=page.getByRole('form',{name:'Edit journal moment'});await editor.getByLabel('Your words').fill('A corrected harbour memory.');await editor.getByLabel('Place',{exact:true}).fill('Our harbour stop');await editor.getByRole('button',{name:'save moment'}).click();moment=page.locator('.memory').filter({hasText:'A corrected harbour memory.'});assert.equal(await moment.locator('img').getAttribute('src'),original)
 await moment.getByRole('button',{name:'delete moment'}).click();assert.equal(await page.getByText('A corrected harbour memory.',{exact:true}).count(),0);await page.getByRole('button',{name:'undo',exact:true}).click();await page.getByText('A corrected harbour memory.',{exact:true}).waitFor()
 await page.waitForTimeout(1000);await page.reload();await page.getByText('A corrected harbour memory.',{exact:true}).waitFor();assert.equal(await page.locator('.memory').filter({hasText:'A corrected harbour memory.'}).locator('img').getAttribute('src'),original)
 await page.screenshot({path:'scripts/out/consistency/journal.png',fullPage:true})
 assert.deepEqual(externalWrites,[]);assert.deepEqual(errors,[])
 console.log('Passed: common Today/trip selectors, in-chat mic/magic, styling reply, add/edit/remove/undo travel details, journal edit/delete/undo/photo preservation and reload. No provider actions.')
}finally{await browser.close()}
