// Isolated browser fixtures: all backend routes intercepted; never changes the owner's server data or sends a provider request.
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { seed } from '../src/data/seed.ts'
const base=process.env.BASE??'http://127.0.0.1:5180'
const browser=await chromium.launch({channel:'chrome',headless:true})
mkdirSync('scripts/out',{recursive:true})
try {
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[],requests=[]
 let state=seed();state.profile.name='Star';let version=0;let chat={id:'fixture-chat',status:'idle',turns:[],updatedAt:1};let sends=0
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname,method=request.method();requests.push({path,method})
  if(path==='/api/session'||path==='/api/status')return route.fulfill({json:{provider:'live',authenticated:true,owner:true,foConnected:true,account:{id:'test-star',kind:'owner'}}})
  if(path==='/api/workspace'){if(method==='PUT'){const body=request.postDataJSON();state=body.state;version++}return route.fulfill({json:{version,state}})}
  if(path==='/api/fo/status')return route.fulfill({json:{provider:'live',state:'connected',tools:['ask_fo','start_fo_call']}})
  if(path==='/api/fo/chats')return route.fulfill({json:method==='POST'?{chat}:{chats:[]}})
  if(path.endsWith('/prepare')){const body=request.postDataJSON();chat={...chat,pending:{text:body.text,message:body.text,hash:'fixture-hash',risk:body.text.includes('Book')?['fo_authorization','booking']:['fo_authorization']}};return route.fulfill({json:{chat}})}
  if(path.endsWith('/send')){sends++;chat={...chat,pending:undefined,turns:[...chat.turns,{id:String(sends),role:'me',text:chat.pending.text,at:1}]};return route.fulfill({json:{chat}})}
  if(path==='/api/gmail/status')return route.fulfill({json:{configured:false,connected:false}})
  if(path==='/api/actions')return route.fulfill({json:{actions:[]}})
  return route.fulfill({status:503,json:{error:'Intentionally not connected in this isolated UI test'}})
 })
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto(base);await page.locator('.wm-land path').first().waitFor(); await page.locator('.arrival').waitFor({state:'hidden'})
 assert.equal(await page.locator('.wm-star').count(),0)
 assert.equal(await page.locator('.home-links').count(),0)
 assert.equal(await page.getByText('Natural Earth · public domain',{exact:true}).count(),0)
 await page.locator('[data-country=IN]').dispatchEvent('click');await page.getByText('India · Unity in diversity.',{exact:true}).waitFor()
 await page.locator('[data-country=BR]').dispatchEvent('click');await page.getByText('Brazil · Find your own rhythm.',{exact:true}).waitFor()
 const initial=await page.locator('.world-map > g').getAttribute('transform')
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();assert.notEqual(await page.locator('.world-map > g').getAttribute('transform'),initial)
 await page.getByRole('button',{name:'Reset world map'}).click()
 await page.screenshot({path:'scripts/out/stars-home-dark.png',fullPage:true})
 await page.locator('.theme-toggle').click()
 await page.waitForFunction(()=>document.documentElement.dataset.theme==='light' && getComputedStyle(document.querySelector('.frame')).backgroundColor==='rgb(247, 244, 237)')
 await page.screenshot({path:'scripts/out/stars-home-light.png',fullPage:true})
 await page.goto(base+'/#/tasks');const priority=page.getByRole('button',{name:/^Priority:/}).last();const priorityName=await priority.getAttribute('aria-label');await priority.click();assert.equal(await page.locator('.task-priority').first().getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.task-priority').first().getAttribute('aria-label'),priorityName)
 assert.equal(requests.filter(r=>/\/send|\/approve/.test(r.path)).length,0)
 await page.locator('.task-star').first().click();await page.getByText('Connected to Wajo Fo',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:/simulat/i}).count(),0)
 await page.getByLabel('Message to Fo',{exact:true}).fill('Hello, help me think about a trip');await page.getByRole('button',{name:'Send message',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.fo-input input').value==='');assert.equal(sends,1);assert.equal(await page.getByTestId('fo-preview').count(),0)
 await page.getByLabel('Message to Fo',{exact:true}).fill('Book a hotel');await page.getByRole('button',{name:'Send message',exact:true}).click();await page.getByTestId('fo-preview').waitFor();assert.equal(sends,1);assert.equal(await page.getByRole('button',{name:'Send to Fo',exact:true}).isDisabled(),true)
 await page.getByRole('tab',{name:'nearby & events',exact:true}).click();await page.getByRole('group',{name:'Magic for'}).getByRole('button',{name:'Today',exact:true}).click();await page.getByRole('heading',{name:'Make a little room for today.',exact:true}).waitFor();await page.screenshot({path:'scripts/out/stars-today-light.png',fullPage:true})
 const ink=await page.locator('.discover-panel').evaluate(el=>getComputedStyle(el).color);assert.equal(ink,'rgb(41, 46, 50)')
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.waitForFunction(()=>getComputedStyle(document.querySelector('.discover-go')).backgroundColor==='rgb(232, 203, 136)');await page.screenshot({path:'scripts/out/stars-today-dark.png',fullPage:true});assert.equal(await page.locator('.discover-panel').evaluate(el=>getComputedStyle(el).color),'rgb(241, 237, 228)')
 for(const theme of ['dark','light']) {await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);const controls=await page.locator('.magic-sheet .chip.on, .magic-sheet .btn-solid').evaluateAll(els=>els.map(el=>({color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor})));for(const style of controls){const lum=(str)=>{const a=str.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return a[0]*.2126+a[1]*.7152+a[2]*.0722};const a=lum(style.color),b=lum(style.background);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,JSON.stringify({theme,style}))}}
 await page.getByRole('button',{name:'Close Magic'}).click()
 await page.goto(base+'/#/trip/lisbon');const tripPriority=page.getByRole('button',{name:/^Priority:/}).last();const tripName=await tripPriority.getAttribute('aria-label');await tripPriority.click();assert.equal(await page.locator('.plan .task-priority').first().getAttribute('aria-label'),tripName)
 await page.goto(base+'/#/new');await page.getByRole('button',{name:'I’m ready to make a trip'}).click();await page.getByRole('button',{name:'Only flights—staying with family'}).click()
 await page.getByLabel('Destination',{exact:true}).fill('Vijayawada');await page.getByRole('button',{name:'make my trip',exact:true}).click();await page.getByRole('heading',{name:'Vijayawada',exact:true}).waitFor()
 await page.waitForFunction(()=>document.querySelectorAll('.crow').length===1)
 assert.match((await page.locator('.checklist').allInnerTexts()).join(' '),/Compare flights/);assert.doesNotMatch((await page.locator('.checklist').allInnerTexts()).join(' '),/dinner|stay/i)
 await page.screenshot({path:'scripts/out/stars-family-trip.png',fullPage:true})
 await page.goto(base+'/#/welcome');await page.getByText('Travel documents',{exact:true}).click();await page.getByRole('heading',{name:'Your travel documents'}).waitFor()
 await page.getByLabel('Vault passphrase',{exact:true}).fill('a private browser test passphrase')
 await page.getByRole('button',{name:'create private vault',exact:true}).click()
 await page.getByRole('button',{name:'add a document',exact:true}).waitFor()
 await page.locator('.privacy-card input[type=file][accept*=pdf]').setInputFiles({name:'test-passport.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 test fixture')})
 await page.getByLabel('Full name',{exact:true}).fill('A Star')
 await page.getByLabel('Document number',{exact:true}).fill('PRIVATE-123')
 await page.getByRole('button',{name:'save encrypted',exact:true}).click()
 await page.getByText('passport · test-passport.pdf',{exact:true}).click()
 await page.getByRole('checkbox',{name:'Full name: A Star',exact:true}).check()
 await page.getByRole('button',{name:'review selected fields with Fo',exact:true}).click()
 const draft=await page.getByLabel('Message to Fo',{exact:true}).inputValue()
 assert.match(draft,/Full name: A Star/);assert.doesNotMatch(draft,/PRIVATE-123/)
 assert.equal(await page.evaluate(()=>Object.values(localStorage).some(v=>v.includes('PRIVATE-123'))),false)
 assert.equal(sends,1)
 await page.getByRole('button',{name:'Close Magic'}).click()
 await page.getByRole('button',{name:'lock',exact:true}).click()
 await page.getByLabel('Vault passphrase',{exact:true}).fill('a private browser test passphrase')
 await page.getByRole('button',{name:'unlock documents',exact:true}).click()
 await page.getByText('passport · test-passport.pdf',{exact:true}).waitFor()
 const privateCheck=await page.evaluate(async()=>{
  const v=await import('/src/privacy/vault.ts');const pass='this test is local only';const created=await v.newVault(pass);await v.writeVault('test-isolated-vault',created.envelope,0)
  const docs=[{id:'one',kind:'passport',name:'example.pdf',mime:'application/pdf',file:'JVBERg==',addedAt:1,fields:{'Document number':'PRIVATE-123'}}]
  const next=await v.encryptVault(created.key,created.envelope.salt,docs,2);await v.writeVault('test-isolated-vault',next,1)
  let conflict=false;try{await v.writeVault('test-isolated-vault',next,1)}catch{conflict=true}
  const read=await v.readVault('test-isolated-vault'),opened=await v.unlockVault(pass,read)
  return{conflict,safe:!JSON.stringify(read).includes('PRIVATE-123'),roundtrip:opened.docs[0].fields['Document number']==='PRIVATE-123',isolated:await v.readVault('another-vault')===undefined}
 });assert.deepEqual(privateCheck,{conflict:true,safe:true,roundtrip:true,isolated:true})
 await page.getByRole('button',{name:'Close profile',exact:true}).click();await page.locator('.home').waitFor();await page.screenshot({path:'scripts/out/stars-return-home.png',fullPage:true})
 assert.deepEqual(errors,[])
 console.log('Passed: map zoom/reset and both themes, no default marker/duplicate shortcuts, priority without execution, live-only Fo UI, flights-only creation, encrypted IndexedDB isolation/conflict detection, profile close, readable Today in both themes, priority ordering in Tasks and trip, one-tap conversation with action review, no page errors.')
} finally {await browser.close()}
