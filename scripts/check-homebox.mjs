// Text-chat history regression: all account/provider traffic is an isolated fixture.
import assert from 'node:assert/strict'
import {chromium} from 'playwright-core'
import {mkdirSync} from 'node:fs'
import {seed,WARDROBE} from '../src/data/seed.ts'
import {withPresentation} from '../src/data/presentation.ts'
const browser=await chromium.launch({channel:'chrome',headless:true}),base='http://127.0.0.1:5180'
mkdirSync('scripts/out/homebox',{recursive:true})
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),state=withPresentation(seed(),WARDROBE),errors=[]
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000)
 const turn=(id,text)=>({id,role:'me',displayText:text,text,at:1})
 let chats=[{id:'old-general',status:'idle',updatedAt:2,turns:[turn('t1','My earlier travel dreams'),{id:'r1',role:'fo',text:'Your old reply is still saved.',at:2}]},{id:'trip-private',tripId:'showcase-la',status:'idle',updatedAt:3,turns:[turn('t2','Only for my LAX trip')]}],writes=0,created=0
 await page.route('**/api/**',async route=>{
  const request=route.request(),u=new URL(request.url()),path=u.pathname
  if(path==='/api/status'||path==='/api/session')return route.fulfill({json:{provider:'live',authenticated:true,owner:true,foConnected:true,account:{id:'history-fixture',kind:'owner'}}})
  if(path==='/api/workspace')return route.fulfill({json:{state,version:1}})
  if(path==='/api/intelligence')return route.fulfill({json:{checkedAt:new Date().toISOString(),model:'fixture',searched:false,sections:[{text:'# Stay safe\nFixture only.',sources:[]}]}})
  if(path==='/api/actions')return route.fulfill({json:{actions:[]}})
  if(path==='/api/fo/status')return route.fulfill({json:{state:'connected',provider:'live'}})
  if(path==='/api/fo/chats'){
   if(request.method()==='POST'){const c={id:'created-'+(++created),tripId:request.postDataJSON().tripId,status:'idle',updatedAt:Date.now(),turns:[]};chats.unshift(c);return route.fulfill({json:{chat:c}})}
   return route.fulfill({json:{chats:chats.filter(c=>(c.tripId??'')===(u.searchParams.get('tripId')??'')).sort((a,b)=>b.updatedAt-a.updatedAt)}})
  }
  const match=path.match(/^\/api\/fo\/chats\/([\w-]+)$/);if(match)return route.fulfill({json:{chat:chats.find(c=>c.id===match[1])}})
  if(request.method()!=='GET'&&path!=='/api/session')writes++
  return route.fulfill({status:503,json:{error:'Not connected in this fixture'}})
 })
 await page.goto(base+'/#/');await page.locator('.arrival').waitFor({state:'hidden'});const box=page.getByRole('group',{name:'Next adventure'});await box.getByLabel('Trip mode destination').waitFor();assert.equal(await box.getByRole('button',{name:'Enter trip mode'}).count(),1);assert.equal(await page.locator('.home-trip').count(),1)
 assert.equal(await page.locator('.home-map').evaluate(el=>el.firstElementChild.classList.contains('home-legend')),true)
 await box.getByLabel('Trip mode destination').selectOption('showcase-yosemite');assert.match(await box.innerText(),/Nov 6/);await box.getByRole('button',{name:'Enter trip mode'}).click();await page.getByRole('region',{name:'Yosemite area map',exact:true}).waitFor();await page.getByRole('button',{name:'my world',exact:true}).click()
 for(const theme of ['dark','light']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.screenshot({path:`scripts/out/homebox/home-${theme}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth))}
 await page.goto(base+'/#/tasks');await page.getByRole('button',{name:'Ask Fo. Get shit done.',exact:true}).click();await page.getByRole('heading',{name:'Magic',exact:true}).waitFor();assert.ok(page.url().endsWith('#/tasks'));assert.match(await page.getByLabel('Message to Fo',{exact:true}).inputValue(),/Help me work through my common tasks/);assert.equal(created,0)
 await page.getByRole('button',{name:'Close Magic'}).click();const task=page.locator('.task-star').first();const label=await task.getAttribute('aria-label');await task.click();await page.getByLabel('Message to Fo',{exact:true}).waitFor();assert.match(await page.getByLabel('Message to Fo',{exact:true}).inputValue(),new RegExp(label.replace('Magic for ','').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));assert.equal(created,0);assert.equal(writes,0);assert.deepEqual(errors,[])
 console.log('Passed: unified trip-mode card with destination/date selection, legend above map, readable light/dark mobile layout, contextual task sheet and reviewed common-task draft. No provider messages sent.')
}finally{await browser.close()}
