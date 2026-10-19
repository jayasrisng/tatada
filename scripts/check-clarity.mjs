// Cross-screen readability/navigation checks. All account and provider APIs are isolated fixtures.
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {chromium} from 'playwright-core'
import {seed,WARDROBE} from '../src/data/seed.ts'
import {withPresentation} from '../src/data/presentation.ts'
const base=process.env.BASE??'http://127.0.0.1:5180',browser=await chromium.launch({channel:'chrome',headless:true})
mkdirSync('scripts/out/clarity',{recursive:true})
try{
 const context=await browser.newContext(),page=await context.newPage(),errors=[],results=[]
 let state=withPresentation(seed(),WARDROBE),version=1
 page.on('pageerror',e=>errors.push(e.message))
 page.on('console',msg=>{if(msg.type()==='error' && /cannot be a descendant|cannot contain|hydration|each child.*key|invalid hook/i.test(msg.text()))errors.push(msg.text())})
 await page.addInitScript(()=>{const t=new URL(location.href).searchParams.get('reviewTheme');if(t==='dark'||t==='light')localStorage.setItem('tatada:theme',t)})
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname
  if(path==='/api/status'||path==='/api/session')return route.fulfill({json:{provider:'live',authenticated:true,owner:true,foConnected:true,account:{id:'clarity-test',kind:'owner'}}})
  if(path==='/api/workspace'){if(req.method()==='PUT'){state=req.postDataJSON().state;version++}return route.fulfill({json:{state,version}})}
  if(path==='/api/actions')return route.fulfill({json:{actions:[]}})
  if(path==='/api/fo/status')return route.fulfill({json:{provider:'live',state:'connected'}})
  if(path==='/api/fo/chats')return route.fulfill({json:{chats:[]}})
  if(path==='/api/gmail/status')return route.fulfill({json:{configured:false,connected:false}})
  if(path==='/api/print/printer')return route.fulfill({json:{printer:{email:'fixture-desk@print.epsonconnect.com',plainPaper:'letter',colorInk:'yes',autoDuplex:'yes',bodyPrintingOff:'yes',senderApproved:'yes',directPrint:false,updatedAt:1}}})
  if(path==='/api/print/sender')return route.fulfill({json:{delivery:'gmail',sender:{kind:'gmail',verified:false,label:'Gmail not connected'}}})
  if(path==='/api/print/jobs')return route.fulfill({json:{jobs:[]}})
  if(path==='/api/intelligence')return route.fulfill({json:{checkedAt:new Date().toISOString(),model:'fixture',searched:true,sections:[{text:'# Stay safe\nKeep the useful numbers handy.',sources:[]}]}})
  return route.fulfill({status:503,json:{error:'Not connected in this isolated review'}})
 })
 const routes=['/','/trips','/trips/map','/tasks','/style','/welcome','/new','/trip/showcase-la','/trip/showcase-sydney/notebook','/trip/showcase-sydney/journal','/trip/showcase-sydney/print/flights']
 for(const width of [320,390,1280])for(const theme of ['dark','light']){
  await page.setViewportSize({width,height:844})
  for(const route of routes){
   await page.goto(base+'/?reviewTheme='+theme+'#'+route);await page.locator('.screen').first().waitFor();await page.locator('.arrival').waitFor({state:'hidden'});await page.waitForTimeout(120)
   assert.equal(await page.locator('html').getAttribute('data-theme'),theme)
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)
   results.push({route,width,theme,overflow})
   if(width===390&&['/welcome','/style','/trip/showcase-la'].includes(route))await page.screenshot({path:`scripts/out/clarity/${route.replace(/\W+/g,'-')}-${theme}.png`,fullPage:true})
  }
  await page.goto(base+'/?reviewTheme='+theme+'#/');await page.getByRole('button',{name:'Enter trip mode',exact:true}).click()
  await page.getByRole('checkbox',{name:'Complete Your flight',exact:true}).waitFor()
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)
  results.push({route:'trip-mode',width,theme,overflow})
  if(width===320)await page.screenshot({path:`scripts/out/clarity/journey-320-${theme}.png`})
  await page.getByRole('button',{name:'my world',exact:true}).click()
 }
 writeFileSync('scripts/out/clarity/results.json',JSON.stringify({results,errors},null,2))
 assert.deepEqual(results.filter(r=>r.overflow>1),[],'no horizontal page overflow in the reviewed sizes and themes')
 assert.deepEqual(errors,[],'no runtime errors or invalid React markup')
 await page.goto(base+'/#/welcome');await page.getByRole('heading',{name:/Your space,/}).waitFor();assert.equal(await page.getByText('Same stardust. Fewer borders.',{exact:true}).count(),0)
 await page.getByRole('button',{name:'edit my details',exact:true}).click();await page.getByLabel('Your name',{exact:true}).waitFor();await page.getByRole('button',{name:'back',exact:true}).click();await page.getByRole('button',{name:'Close profile',exact:true}).click();await page.locator('.home').waitFor()
 await page.goto(base+'/#/trip/showcase-la');assert.equal(await page.getByText('demo time travel:',{exact:true}).count(),0)
 await page.goto(base+'/#/style');for(const name of ['outfits','mix & match','closet','day plan','packing'])assert.equal(await page.getByRole('tab',{name,exact:true}).count(),1)
 console.log(`Passed: ${results.length} screen/size/theme combinations, no horizontal overflow or React errors, clearer profile and Style labels, no demo time-travel control. No provider calls or print sends.`)
}finally{await browser.close()}
