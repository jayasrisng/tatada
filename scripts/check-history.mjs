// Text-chat history regression: all account/provider traffic is an isolated fixture.
import assert from 'node:assert/strict'
import {chromium} from 'playwright-core'
import {mkdirSync} from 'node:fs'
import {seed,WARDROBE} from '../src/data/seed.ts'
import {withPresentation} from '../src/data/presentation.ts'
const browser=await chromium.launch({channel:'chrome',headless:true}),base='http://127.0.0.1:5180'
mkdirSync('scripts/out/history',{recursive:true})
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),state=withPresentation(seed(),WARDROBE),errors=[]
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000)
 const turn=(id,text)=>({id,role:'me',displayText:text,text,at:1})
 let chats=[{id:'old-general',status:'idle',updatedAt:2,turns:[turn('t1','My earlier travel dreams'),{id:'r1',role:'fo',text:'Your old reply is still saved.',at:2}]},{id:'trip-private',tripId:'showcase-la',status:'idle',updatedAt:3,turns:[turn('t2','Only for my LAX trip')]}],writes=0,created=0
 await page.route('**/api/**',async route=>{
  const request=route.request(),u=new URL(request.url()),path=u.pathname
  if(path==='/api/status'||path==='/api/session')return route.fulfill({json:{provider:'live',authenticated:true,owner:true,foConnected:true,account:{id:'history-fixture',kind:'owner'}}})
  if(path==='/api/workspace')return route.fulfill({json:{state,version:1}})
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
 await page.goto(base+'/#/style');await page.getByRole('heading',{name:'Closet',exact:true}).waitFor();await page.getByText('Pack your bags. The world is calling.',{exact:true}).waitFor();await page.getByRole('group',{name:'Closet for'}).getByRole('button',{name:'Yosemite',exact:true}).click();await page.getByText('Pack your bags. The mountains are calling.',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Ask Magic',exact:true}).click();await page.getByRole('tab',{name:'Fo chat',exact:true}).click()
 await page.getByText('Your old reply is still saved.',{exact:true}).waitFor();await page.getByLabel('Message to Fo',{exact:true}).fill('My unfinished draft')
 await page.getByRole('button',{name:'new conversation',exact:true}).click();await page.getByText('what can Fo help with?',{exact:true}).waitFor();assert.equal(chats.length,3)
 await page.getByRole('button',{name:/^History/}).click();const history=page.getByRole('navigation',{name:'Conversation history'});await history.getByRole('button',{name:'Open conversation: My earlier travel dreams',exact:true}).click();await page.getByText('Your old reply is still saved.',{exact:true}).waitFor();assert.equal(await page.getByLabel('Message to Fo',{exact:true}).inputValue(),'My unfinished draft')
 await page.getByRole('button',{name:/^History/}).click();assert.equal(await history.getByText('Only for my LAX trip',{exact:true}).count(),0);await page.screenshot({path:'scripts/out/history/history.png',fullPage:true})
 await page.reload();await page.getByRole('button',{name:'Ask Magic',exact:true}).click();await page.getByRole('tab',{name:'Fo chat',exact:true}).click();await page.getByRole('button',{name:/^History/}).click();await page.getByRole('navigation',{name:'Conversation history'}).getByRole('button',{name:'Open conversation: My earlier travel dreams',exact:true}).click();await page.getByText('Your old reply is still saved.',{exact:true}).waitFor()
 assert.equal(created,1);assert.equal(writes,0);assert.deepEqual(errors,[])
 console.log('Passed: Closet naming and packing copy; new conversation preserves prior history and unfinished drafts; old chat reopens after reload; trip history stays scoped. No provider messages sent.')
}finally{await browser.close()}
