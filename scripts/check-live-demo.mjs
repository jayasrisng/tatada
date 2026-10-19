// Explicit live rehearsal. Creates one labeled test trip and sends one planning-only Fo request.
// Never sends email, starts calls, books, pays, or submits print jobs. No transport fixtures.
import assert from 'node:assert/strict'
import {chromium} from 'playwright-core'
import {mkdirSync,writeFileSync,appendFileSync,readFileSync,copyFileSync,chmodSync} from 'node:fs'
import {PDFDocument} from 'pdf-lib'
const base=process.env.BASE??'http://127.0.0.1:5180'
assert.match(base,/^http:\/\/(127\.0\.0\.1|localhost):\d+$/)
const browser=await chromium.launch({channel:'chrome',headless:true})
const resumeId=process.argv.find(v=>v.startsWith('--resume='))?.slice(9)
if(resumeId)assert.match(resumeId,/^[0-9TZ-]+$/)
const runId=resumeId??new Date().toISOString().replace(/[:.]/g,'-'),out=`scripts/out/live-demo/${runId}`
mkdirSync(out,{recursive:true});mkdirSync('.data/e2e-backups',{recursive:true,mode:0o700})
if(!resumeId)copyFileSync('.data/server-live.json',`.data/e2e-backups/${runId}.json`);chmodSync(`.data/e2e-backups/${runId}.json`,0o600)
let result={runId,startedAt:new Date().toISOString(),timezone:'America/Los_Angeles',task:'Create a labeled test trip, receive a sourced Claude briefing and a contextual Fo preparation plan, save a journal note, download its PDF, and verify persistence after reload.',live:true,mocks:false,attemptStarted:false,success:false,checks:[],http:[],toolCalls:[],blockedExternalActions:[],errors:[]}
if(resumeId){result=JSON.parse(readFileSync(`${out}/result.json`,'utf8'));writeFileSync(`${out}/interrupted-result.json`,JSON.stringify(result,null,2));result.interruptions=[...(result.interruptions??[]),{...result.failure,classification:result.failure?.message?.includes('classified')?'test runner observed a transient preparation state; backend delivery proceeded':'test runner incorrectly waited for the composer to be enabled while Fo was working'}];delete result.failure;result.success=false}
const log=(step,detail={})=>{result.checks.push({at:new Date().toISOString(),step,...detail});writeFileSync(`${out}/result.json`,JSON.stringify(result,null,2));console.log(step,JSON.stringify(detail))}
let tripId=result.tripId,chatId=result.chatId,reply,briefing,attemptAt=resumeId?Date.parse(result.checks.find(c=>c.step==='Measured attempt started').at):undefined
const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Los_Angeles',acceptDownloads:true}),page=await context.newPage()
page.setDefaultTimeout(20000)
page.on('pageerror',error=>result.errors.push(error.message))
await page.route('**/api/**',route=>{
 const req=route.request(),path=new URL(req.url()).pathname
 const forbidden=req.method()!=='GET'&&(/\/api\/(actions|gmail)\b/.test(path)||path==='/api/fo/voice/join'||path.startsWith('/api/print/jobs'))
 if(forbidden){result.blockedExternalActions.push({path,method:req.method()});return route.abort('blockedbyclient')}
 return route.continue()
})
page.on('response',async response=>{
 const req=response.request(),path=new URL(response.url()).pathname
 if(!path.startsWith('/api/'))return
 result.http.push({at:new Date().toISOString(),method:req.method(),path,status:response.status()})
 try{
  if(path==='/api/intelligence'){const body=await response.json();briefing={status:response.status(),...body}}
  if(path==='/api/fo/chats'&&req.method()==='POST')chatId=(await response.json()).chat?.id
 }catch{}
})
try{
 await page.goto(base+'/#/trips');await page.locator('.arrival').waitFor({state:'hidden'})
 const status=await(await page.request.get(base+'/api/status')).json();assert.equal(status.provider,'live');assert.equal(status.authenticated,true);assert.equal(status.foConnected,true)
 const connection=await(await page.request.get(base+'/api/fo/status')).json();assert.equal(connection.state,'connected')
 const gmail=await(await page.request.get(base+'/api/gmail/status')).json()
 log('Preflight: live owner session and Fo connected',{gmailConfigured:!!gmail.configured,gmailConnected:!!gmail.connected,foTools:connection.tools})
 if(!resumeId){
 await page.goto(base+'/#/new');await page.getByRole('button',{name:'I’m ready to make a trip',exact:true}).click()
 await page.getByLabel('Destination',{exact:true}).fill('Los Angeles (E2E test)')
 await page.getByLabel('Country (optional)',{exact:true}).fill('United States')
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
 const next=n=>{const date=new Date(today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+n);return date.toISOString().slice(0,10)}
 const start=next(1),end=next(3)
 await page.getByLabel('Leave',{exact:true}).fill(start);await page.getByLabel('Return',{exact:true}).fill(end)
 await page.getByLabel('Who’s coming?',{exact:true}).fill('Synthetic end-to-end demo; no reservations')
 await page.getByLabel('Needs, pets, accessibility, or anything else',{exact:true}).fill('')
 await page.getByLabel('Discount eligibility and memberships (separate with ;)',{exact:true}).fill('')
 result.attemptStarted=true;attemptAt=Date.now();log('Measured attempt started',{start,end})
 await page.getByRole('button',{name:'make my trip',exact:true}).click()
 await page.waitForURL(/#\/trip\/[^/?]+$/);tripId=page.url().split('#/trip/')[1];result.tripId=tripId
 log('Trip created through UI',{tripId})
 await page.waitForFunction(()=>document.querySelectorAll('.brief-bite').length>0||Array.from(document.querySelectorAll('[role=alert]')).some(e=>e.textContent.trim()),{},{timeout:110000})
 assert.equal(briefing?.status,200,briefing?.error??'Claude did not return a briefing')
 assert.equal(briefing.incomplete,false,'Claude returned an incomplete answer')
 assert.equal(briefing.searched,true,'Claude briefing has no citations')
 assert.ok(briefing.sections.flatMap(s=>s.sources).length>0)
 writeFileSync(`${out}/claude-briefing.json`,JSON.stringify(briefing,null,2))
 log('Real Claude briefing rendered',{model:briefing.model,sources:[...new Set(briefing.sections.flatMap(s=>s.sources.map(x=>x.url)))]})
 }else{briefing=JSON.parse(readFileSync(`${out}/claude-briefing.json`,'utf8'));await page.goto(`${base}/#/trip/${tripId}`);log('Resuming the same measured attempt; existing Fo request will not be resent',{chatId})}
 await page.getByRole('button',{name:'Ask Magic',exact:true}).click();await page.getByRole('tab',{name:'Fo chat',exact:true}).click()
 const input=page.getByLabel('Message to Fo',{exact:true});await input.waitFor();if(!resumeId)await page.waitForFunction(()=>!document.querySelector('[aria-label="Message to Fo"]')?.disabled)
 const message=`For this synthetic Tatada demonstration, use the included trip dates and destination to give exactly three numbered preparation tips for Los Angeles. Include the dates in your answer. Advice only; no external operations.`
 if(!resumeId){
 await input.fill(message);await page.getByRole('button',{name:'Send message',exact:true}).click()
 // A planning-only request may still match conservative risk keywords. Do not approve action risks.
 await page.waitForFunction(()=>document.querySelector('.fo-turn.me')||document.querySelector('.fo-risk'),{},{timeout:20000})
 if(await page.locator('.fo-risk').count())throw Error('Planning-only request requires external-action approval; not approved')
 log('One real Fo request submitted',{chatId})
 }
 await page.locator('.fo-turn.tatada .fo-text').first().waitFor({timeout:210000})
 reply=await page.locator('.fo-turn.tatada .fo-text').first().innerText()
 assert.ok(reply.trim().split(/\s+/).length>=20,'Fo response too short')
 const dates=result.checks.find(c=>c.step==='Measured attempt started');assert.match(reply,/Los Angeles/i);assert.ok(reply.includes(String(Number(dates.start.slice(-2))))&&reply.includes(String(Number(dates.end.slice(-2)))),'Fo omitted trip dates')
 assert.ok((reply.match(/(?:^|\n)\s*(?:\*\*)?[123][.)]/g)??[]).length>=3,'Fo did not return three numbered steps')
 const chat=await(await page.request.get(`${base}/api/fo/chats/${chatId}`)).json();assert.equal(chat.chat.status,'idle');assert.equal(chat.chat.turns.filter(t=>t.role==='me').length,1);assert.equal(chat.chat.turns.find(t=>t.role==='me').delivery,'delivered')
 writeFileSync(`${out}/fo-answer.txt`,reply)
 log('Fo answered in UI and server stored completed conversation',{replyCharacters:reply.length})
 await page.getByRole('button',{name:'Close Magic',exact:true}).click();await page.goto(`${base}/#/trip/${tripId}/journal`)
 const note=`E2E demo ${runId}: I saved my preparation plan in Tatada. This is a test journal entry, not an actual visit.`
 await page.getByLabel('Moment note',{exact:true}).fill(note);await page.getByRole('button',{name:'save moment',exact:true}).click()
 await page.getByRole('status').filter({hasText:'Saved to your journal.'}).waitFor()
 await page.waitForFunction(async ({tripId,note})=>{const r=await fetch('/api/workspace');const data=await r.json();return data.state?.trips.find(t=>t.id===tripId)?.memories.some(m=>m.text===note)},{tripId,note},{timeout:20000})
 await page.reload();await page.locator('.memory>p').filter({hasText:note}).waitFor();log('Journal saved and survives reload')
 await page.getByRole('button',{name:'Print',exact:true}).click();const downloadLink=page.getByRole('link',{name:'Download PDF',exact:true});await page.waitForFunction(()=>document.querySelector('a[aria-label="Download PDF"]')?.getAttribute('href')?.startsWith('blob:'))
 const downloaded=page.waitForEvent('download');await downloadLink.click();const download=await downloaded;await download.saveAs(`${out}/journal.pdf`)
 const pdf=await PDFDocument.load(readFileSync(`${out}/journal.pdf`));assert.ok(pdf.getPageCount()>0);log('Real journal PDF downloaded',{pages:pdf.getPageCount(),bytes:readFileSync(`${out}/journal.pdf`).length})
 await page.goto(`${base}/#/trip/${tripId}`);await page.getByRole('button',{name:'Ask Magic',exact:true}).click();await page.getByRole('tab',{name:'Fo chat',exact:true}).click()
 await page.locator('.fo-turn.tatada .fo-text').first().waitFor();assert.equal(await page.locator('.fo-turn.tatada .fo-text').first().innerText(),reply)
 const workspace=await(await page.request.get(base+'/api/workspace')).json(),saved=workspace.state.trips.find(t=>t.id===tripId)
 assert.ok(saved.research?.some(r=>r.searched));assert.ok(saved.memories.some(m=>m.text===note));assert.equal(saved.bookings.length,0)
 log('Fo history and sourced briefing survive reload; no bookings invented')
 await page.screenshot({path:`${out}/fo-result.png`,fullPage:true})
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.blockedExternalActions,[])
 result.success=true
}catch(error){result.failure={message:error.message,at:new Date().toISOString()};console.log('FAIL',error.message);await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});process.exitCode=1}
finally{
 result.finishedAt=new Date().toISOString()
 const data=JSON.parse(readFileSync('.data/server-live.json','utf8'))
 result.toolCalls=Object.values(data.foTrace??{}).flat().filter(e=>e.at>=(attemptAt??Date.now())).map(e=>({at:new Date(e.at).toISOString(),tool:e.tool,transportOK:e.ok,providerError:!!e.isError,responseShape:e.structured??e.textShape}))
 result.chatId=chatId;writeFileSync(`${out}/result.json`,JSON.stringify(result,null,2))
 if(result.attemptStarted)appendFileSync('scripts/out/live-demo/runs.jsonl',JSON.stringify({runId,startedAt:result.startedAt,finishedAt:result.finishedAt,task:result.task,success:result.success,tripId,chatId,failure:result.failure,resumed:!!resumeId,interruptions:result.interruptions})+'\n')
 console.log(JSON.stringify({runId,attemptStarted:result.attemptStarted,success:result.success,checks:result.checks.length,tools:result.toolCalls.map(t=>t.tool),artifactDirectory:out}))
 await browser.close()
}
