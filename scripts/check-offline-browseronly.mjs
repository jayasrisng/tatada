// Production browser-only parity: saving an offline pack must not trap the connected UI in read-only mode.
import {createServer} from 'node:http'
import {readFileSync,existsSync,appendFileSync,mkdirSync} from 'node:fs'
import {resolve,extname} from 'node:path'
import {chromium} from 'playwright-core'
import assert from 'node:assert/strict'
const dist=resolve(process.env.TATADA_FIXTURE_DIST??'/tmp/tatada-browseronly-dist'),runId=`browseronly-${new Date().toISOString().replaceAll(':','-')}`
const log=(event,detail={})=>appendFileSync('docs/verification/continuation-runs.jsonl',JSON.stringify({runId,at:new Date().toISOString(),category:'automated-fixture',event,...detail})+'\n')
log('started',{criteria:'Backend-disabled production app stays editable online after downloading; offline essentials launch; reconnect returns to full browser workspace.'})
const server=createServer((req,res)=>{const path=new URL(req.url,'http://fixture').pathname,file=resolve(dist,path.slice(1)||'index.html');if(!file.startsWith(dist+'/')||!existsSync(file)){res.writeHead(404);return res.end()}res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(file)]??'application/octet-stream');res.end(readFileSync(file))})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),requests=[]
context.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))requests.push(r.url())})
try{
 await page.goto(base+'/#/trip/lisbon/plan');await page.getByRole('heading',{name:'Lisbon',exact:true}).waitFor();await page.getByText('Keep this trip offline',{exact:true}).click();log('tool-start',{tool:'browser.download-trip'})
 await page.getByRole('button',{name:'download trip',exact:true}).click();await page.getByText('Ready for offline launch. You can put your phone away.',{exact:true}).waitFor({timeout:45000});log('tool-complete',{tool:'browser.download-trip'})
 assert.equal(await page.getByText('Add or edit travel details',{exact:true}).count(),1);assert.equal(await page.getByText(/Offline essentials · saved/).count(),0)
 await context.setOffline(true);await page.close();const offline=await context.newPage();log('tool-start',{tool:'browser.offline-launch'});await offline.goto(base);await offline.getByText(/Offline essentials · saved/).waitFor();log('tool-complete',{tool:'browser.offline-launch'})
 await context.setOffline(false);await offline.getByRole('button',{name:'Your profile',exact:true}).waitFor();assert.equal(await offline.getByText(/Offline essentials · saved/).count(),0);assert.deepEqual(requests,[])
 mkdirSync('scripts/out/continuation/browseronly',{recursive:true});await offline.screenshot({path:'scripts/out/continuation/browseronly/reconnected.png',fullPage:true});log('completed',{success:true,providerCalls:0});console.log('Passed browser-only offline download/online recovery; zero backend API requests.')
}catch(error){log('completed',{success:false,errorClass:error.name});throw error}finally{await browser.close();await new Promise(r=>server.close(r))}
