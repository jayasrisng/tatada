// Isolated browser/API fixture run. No .env, user data, purchases or outbound provider communication.
import { createServer } from 'node:http'
import { readFileSync, existsSync, appendFileSync, mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, extname, join } from 'node:path'
import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { Store } from '../server/store.ts'
import { MockFoAdapter } from '../server/fo.ts'
import { ActionService } from '../server/actions.ts'
import { FoChatService } from '../server/chat.ts'
import { createApp } from '../server/app.ts'
const runId=`fixture-${new Date().toISOString().replaceAll(':','-')}`,out=`scripts/out/continuation/${runId}`
mkdirSync(out,{recursive:true})
const ledger='docs/verification/continuation-runs.jsonl'
const record=(event,detail={})=>appendFileSync(ledger,JSON.stringify({runId,at:new Date().toISOString(),category:'automated-fixture',event,...detail})+'\n')
const call=async(tool,fn)=>{record('tool-start',{tool});try{const value=await fn();record('tool-complete',{tool});return value}catch(e){record('tool-failed',{tool,errorClass:e.name});throw e}}
record('started',{criteria:'Reviewed PDF/text import; duplicate prevention; persistent original; cold offline launch; saved guidance; reviewed proposal/undo; sharing revocation; visible sync conflict; no external network or vault/API response cache.'})
const store=Store.memory(),fo=new MockFoAdapter(store),actions=new ActionService({store,fo}),chats=new FoChatService({store,fo})
const trip={id:'fixture',destination:'Paris (fixture)',country:'France',start:'2026-10-19',end:'2026-10-23',timeZone:'Europe/Paris',travelers:1,companions:'solo',budget:0,vibe:[],constraints:[],discounts:[],status:'upcoming',tint:'yellow',summary:{},options:[],bookings:[],memories:[],itinerary:[{id:'walk',day:'2026-10-20',time:'17:00',title:'Walk in the park',dress:'casual',note:'PRIVATE-NOTE'}]}
store.data.workspaces.owner={version:1,updatedAt:Date.now(),state:{onboarded:true,profile:{name:'Fixture star',homeAirport:'',style:[],diet:[],memberships:[]},trips:[trip],items:[],actions:[],chat:[],canvas:{}}}
store.data.foChats={fixturechat123:{id:'fixturechat123',ownerId:'owner',tripId:'fixture',status:'idle',turns:[{id:'reply123',role:'fo',kind:'reply',text:'Bring a light layer for your walk.',at:Date.now()}],keys:[],createdAt:Date.now(),updatedAt:Date.now(),ref:'TEST',pollErrors:0}}
const distDir=resolve(process.env.TATADA_FIXTURE_DIST??'dist')
let app,base
const server=createServer((req,res)=>{
 if(req.url?.startsWith('/api/'))return void app(req,res)
 const path=new URL(req.url,'http://fixture').pathname
 const rel=path.replace(/^\/tatada\//,'')||'index.html',file=resolve(distDir,rel)
 if(!file.startsWith(distDir+'/')||!existsSync(file)){res.writeHead(404);return res.end()}
 const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'}
 res.writeHead(200,{'content-type':mime[extname(file)]??'application/octet-stream','cache-control':'no-store'});res.end(readFileSync(file))
})
await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`
app=createApp({store,fo,actions,chats,appUrl:base+'/tatada',secureCookies:false,owner:{allowedHosts:[new URL(base).host],allowedOrigins:[base]}})
const profile=mkdtempSync(join(tmpdir(),'tatada-cold-launch-')),options={channel:'chrome',headless:true,viewport:{width:390,height:844},acceptDownloads:true,timezoneId:'America/Los_Angeles'},errors=[],external=[]
let context=await chromium.launchPersistentContext(profile,options)
const routes=()=>context.route('**/*',route=>{const url=new URL(route.request().url());if(url.protocol.startsWith('http')&&url.origin!==base){external.push(url.hostname);return route.abort('blockedbyclient')}return route.continue()})
await routes()
let page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000)
try {
 await call('browser.goto-trip',()=>page.goto(base+'/tatada/#/trip/fixture/plan'))
 await page.getByRole('heading',{name:'Paris (fixture)',exact:true}).waitFor()
 await page.getByText('Add or edit travel details',{exact:true}).click()
 await page.getByText('Import a confirmation',{exact:true}).click()
 const pdf=await PDFDocument.create(),sheet=pdf.addPage();const lines=['Flight confirmation','Airline: Sample Air','Flight: ZZ123','From: SFO','To: CDG','Departure date: 2026-10-19','Departure time: 18:30','Arrival date: 2026-10-20','Arrival time: 14:00','Departure zone: America/Los_Angeles','Arrival zone: Europe/Paris','Confirmation: TEST123']
 lines.forEach((line,i)=>sheet.drawText(line,{x:40,y:760-i*24,size:12}));const pdfBytes=Buffer.from(await pdf.save())
 await call('browser.upload-fixture-pdf',()=>page.getByLabel('Confirmation PDF',{exact:true}).setInputFiles({name:'fixture-confirmation.pdf',mimeType:'application/pdf',buffer:pdfBytes}))
 const review=page.getByRole('form',{name:'Review confirmation'})
 await review.waitFor();assert.equal(await page.getByLabel('Import From',{exact:true}).inputValue(),'SFO');assert.equal(await page.getByLabel('Import Arrival local date and time',{exact:true}).inputValue(),'2026-10-20T14:00')
 assert.equal(store.data.workspaces.owner.state.trips[0].bookings.length,0,'review must not save')
 await call('browser.save-reviewed-import',()=>page.getByRole('button',{name:'save reviewed details',exact:true}).click())
 await page.getByText('Saved travel details. No reservation was made.',{exact:true}).waitFor()
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tatada:v1:acct:owner')).trips[0].bookings.length===1)
 await call('browser.repeat-fixture-upload',()=>page.getByLabel('Confirmation PDF',{exact:true}).setInputFiles({name:'same.pdf',mimeType:'application/pdf',buffer:pdfBytes}))
 await page.getByText('This confirmation is already saved to this trip.',{exact:true}).waitFor()
 await page.getByLabel('Booking confirmation text',{exact:true}).fill('Hotel: Sample House\nCheck in: 2026-10-20\nCheck out: 2026-10-23\nAddress: 10 Sample Road\nConfirmation: HOTEL123')
 await page.getByRole('button',{name:'review extracted details',exact:true}).click();await page.getByRole('form',{name:'Review confirmation'}).waitFor();assert.equal(await page.getByLabel('Import Local time',{exact:true}).inputValue(),'')
 await call('browser.save-reviewed-hotel',()=>page.getByRole('button',{name:'save reviewed details',exact:true}).click())
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tatada:v1:acct:owner')).trips[0].bookings.length===2)
 await call('browser.open-relevant-reservation',()=>page.getByRole('link',{name:'open reservation',exact:true}).click())
 await page.waitForFunction(()=>document.activeElement?.id?.startsWith('booking-'))
 // Direct download must use the exact supplied PDF; a generated flight-notes QR is not a boarding pass.
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'download original',exact:true}).first().click();const download=await downloaded;await download.saveAs(`${out}/fixture-original.pdf`);assert.deepEqual(readFileSync(`${out}/fixture-original.pdf`),pdfBytes)
 await call('browser.reload-persistence',()=>page.reload());await page.getByRole('heading',{name:'Paris (fixture)',exact:true}).waitFor()
 await page.getByText('Keep this trip offline',{exact:true}).click()
 await call('browser.download-trip',()=>page.getByRole('button',{name:'download trip',exact:true}).click())
 await page.getByText('Ready for offline launch. You can put your phone away.',{exact:true}).waitFor({timeout:45000})
 await page.screenshot({path:`${out}/trip-import.png`,fullPage:true})
 // Build cache contains static assets only. No responses carrying tokens, vault data or records.
 const cacheKeys=await page.evaluate(async()=>{const paths=[];for(const key of await caches.keys())for(const req of await(await caches.open(key)).keys())paths.push(new URL(req.url).pathname);return paths})
 assert.ok(cacheKeys.length>10);assert.ok(cacheKeys.every(p=>p==='/tatada/'||p.startsWith('/tatada/assets/')))
 await call('browser.close-process',()=>context.close());context=await call('browser.restart-process',()=>chromium.launchPersistentContext(profile,options));await routes();await call('browser.airplane-mode',()=>context.setOffline(true));page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000)
 await call('browser.cold-offline-launch',()=>page.goto(base+'/tatada/'))
 await page.getByText(/Offline essentials · saved/).waitFor();await page.getByRole('heading',{name:'Reservations',exact:true}).waitFor();assert.ok((await page.locator('body').innerText()).includes('HOTEL123'));assert.ok((await page.locator('body').innerText()).includes('Walk in the park'))
 const offlineDownload=page.waitForEvent('download');await page.getByRole('button',{name:'open original ticket',exact:true}).first().click();await(await offlineDownload).saveAs(`${out}/offline-original.pdf`);assert.deepEqual(readFileSync(`${out}/offline-original.pdf`),pdfBytes)
 await page.screenshot({path:`${out}/offline-cold-launch.png`,fullPage:true})
 await call('browser.reconnect',()=>context.setOffline(false));await page.reload();await page.goto(base+'/tatada/#/');await page.locator('.arrival').waitFor({state:'hidden'});await page.getByRole('button',{name:'Enter trip mode',exact:true}).click()
 await page.getByRole('button',{name:'review as trip update',exact:true}).click();await page.getByLabel('Suggestion text',{exact:true}).fill('Pack a light layer (reviewed fixture)');await call('browser.apply-reviewed-fo-update',()=>page.getByRole('button',{name:'apply reviewed update',exact:true}).click());await page.getByText('Saved as your trip record.',{exact:false}).waitFor()
 await page.reload();await page.locator('.arrival').waitFor({state:'hidden'});await page.getByText('Saved as your trip record.',{exact:false}).waitFor();await call('browser.undo-fo-update',()=>page.locator('.fo-proposal').getByRole('button',{name:'undo',exact:true}).click());await page.getByText('Saved update undone.',{exact:true}).waitFor()
 await page.goto(base+'/tatada/#/trip/fixture/plan');await page.getByText('Share with a friend',{exact:true}).click();await page.getByLabel('I reviewed exactly what will be shared',{exact:true}).check()
 await call('browser.create-view-only-share',()=>page.getByRole('button',{name:'create view-only link',exact:true}).click());const link=await page.getByLabel('View-only trip link',{exact:true}).inputValue();assert.match(link,/#\/shared\//)
 const viewer=await context.newPage();await viewer.goto(link);await viewer.getByRole('heading',{name:'Paris (fixture)',exact:true}).waitFor();assert.ok(!(await viewer.locator('body').innerText()).includes('PRIVATE-NOTE'));assert.ok(!(await viewer.locator('body').innerText()).includes('TEST123'))
 await call('browser.revoke-share',()=>page.getByRole('button',{name:'revoke',exact:true}).click());await viewer.reload();await viewer.getByText('This trip link is unavailable, expired or revoked.',{exact:true}).waitFor();await viewer.close()
 // Warm offline edits remain in the device workspace and sync after reconnection.
 await page.getByText('Add or edit travel details',{exact:true}).click()
 await context.setOffline(true)
 await page.getByLabel('Destination time zone',{exact:true}).fill('Europe/London');await page.getByRole('button',{name:'save time zone',exact:true}).click()
 await page.getByText('Saved on this device. It will sync when the Tatada server is reachable.',{exact:true}).waitFor()
 assert.equal(await page.getByRole('heading',{name:'Paris (fixture)',exact:true}).count(),1)
 await context.setOffline(false);await page.waitForTimeout(1400)
 assert.equal(store.data.workspaces.owner.state.trips[0].timeZone,'Europe/London')
 // Concurrency: remote copy advances while a device edit is in flight. Never silently replace local data.
 store.data.workspaces.owner={...store.data.workspaces.owner,version:store.data.workspaces.owner.version+1,state:structuredClone(store.data.workspaces.owner.state)};store.data.workspaces.owner.state.trips[0].destination='Remote fixture copy'
 await page.getByLabel('Destination time zone',{exact:true}).fill('Europe/Paris');await call('browser.create-workspace-conflict',()=>page.getByRole('button',{name:'save time zone',exact:true}).click());await page.getByRole('alertdialog',{name:'Resolve workspace conflict'}).waitFor();assert.equal(await page.getByRole('heading',{name:'Paris (fixture)',exact:true}).count(),1)
 await page.getByRole('button',{name:'keep this device’s copy',exact:true}).click();await page.getByRole('alertdialog',{name:'Resolve workspace conflict'}).waitFor({state:'hidden'});await page.waitForTimeout(1100);assert.equal(store.data.workspaces.owner.state.trips[0].timeZone,'Europe/Paris')
 // A failed workspace load has a visible cached copy and retries when the connection recovers.
 let failLoad=true
 await context.route('**/api/workspace',route=>{if(failLoad&&route.request().method()==='GET'){failLoad=false;return route.abort('failed')}return route.continue()})
 await call('browser.recover-initial-workspace-load',async()=>{await page.reload();await page.getByText('Could not load the server copy. Local edits are retained. Reconnect before syncing.',{exact:true}).waitFor();await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.getByText('Could not load the server copy. Local edits are retained. Reconnect before syncing.',{exact:true}).waitFor({state:'hidden'});await page.getByRole('heading',{name:'Paris (fixture)',exact:true}).waitFor()})
 // Retained originals remain discoverable after their reservation is removed, and can be deleted independently.
 await page.getByText('Add or edit travel details',{exact:true}).click()
 await page.getByRole('button',{name:'Remove SFO → CDG',exact:true}).click()
 await context.route('https://api.open-meteo.com/**',route=>route.fulfill({json:{current:{temperature_2m:60,weather_code:0,time:Math.floor(Date.now()/1000)}}}))
 await page.goto(base+'/tatada/#/welcome');await page.getByText('Your data',{exact:true}).click();await page.getByText('Export or delete account data',{exact:true}).click();await page.getByText('Original confirmations on this device',{exact:true}).click()
 await page.getByRole('button',{name:'Download original fixture-confirmation.pdf',exact:true}).waitFor()
 await call('browser.delete-retained-original',()=>page.getByRole('button',{name:'Delete original fixture-confirmation.pdf',exact:true}).click())
 await page.getByRole('button',{name:'Download original fixture-confirmation.pdf',exact:true}).waitFor({state:'hidden'})
 await page.getByRole('button',{name:'Download original booking-text.txt',exact:true}).waitFor()
 await page.goto(base+'/tatada/#/trip/fixture/plan')
 await page.screenshot({path:`${out}/reviewed-trip.png`,fullPage:true})
 // Legacy browser workspace keys are prefixes of account keys: listing/deletion must still be isolated.
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('tatada:v1:acct:owner'));localStorage.setItem('tatada:v1',JSON.stringify(s));localStorage.removeItem('tatada:offline:selected:v1')})
 await context.route('**/api/session',route=>route.abort('failed'))
 await page.reload();await page.goto(base+'/tatada/#/welcome');await page.getByText('Your data',{exact:true}).click();await page.getByText('Export or delete account data',{exact:true}).click();await page.getByText('Original confirmations on this device',{exact:true}).click()
 await page.getByText('No original confirmations on this device.',{exact:true}).waitFor()
 await page.getByLabel('Confirm account deletion',{exact:true}).fill('DELETE')
 await call('browser.delete-isolated-legacy-workspace',()=>page.getByRole('button',{name:'delete data',exact:true}).click())
 await page.waitForFunction(()=>localStorage.getItem('tatada:v1:acct:owner')!==null&&localStorage.getItem('tatada:v1')===null||JSON.parse(localStorage.getItem('tatada:v1')??'{}').profile?.name==='Jayasri')
 const privateCopies=await page.evaluate(async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('tatada-confirmations');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});const keys=await new Promise((r,j)=>{const q=db.transaction('files').objectStore('files').getAllKeys();q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});db.close();return {accountCache:localStorage.getItem('tatada:v1:acct:owner')!==null,originals:keys.length}})
 assert.equal(privateCopies.accountCache,true);assert.equal(privateCopies.originals,1)
 assert.deepEqual(errors,[]);assert.deepEqual(external,[])
 const result={runId,success:true,category:'automated-fixture',providerCalls:0,externalCommunications:0,checks:['PDF review/save/original bytes','one-tap relevant reservation','hotel text import/unknown time','duplicate import','reload persistence','explicit download','static-only cache','browser-process cold offline launch','offline original bytes','Fo update/reload/undo','private-field-free shared view/revoke','warm offline pending edit/reconnection','recoverable workspace conflict','initial workspace load recovery','retained original inventory and deletion','legacy/account device deletion isolation'],screenshots:[`${out}/trip-import.png`,`${out}/offline-cold-launch.png`,`${out}/reviewed-trip.png`]}
 writeFileSync(`${out}/result.json`,JSON.stringify(result,null,2));record('completed',{success:true,providerCalls:0});console.log(JSON.stringify(result,null,2))
} catch(e) {record('completed',{success:false,errorClass:e.name});await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});writeFileSync(`${out}/failure.txt`,e.stack??String(e));throw e}finally{await context.close();rmSync(profile,{recursive:true,force:true});await new Promise(r=>server.close(r))}
