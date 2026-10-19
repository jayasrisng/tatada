// Real UI with isolated account/provider APIs. No booking, message or print delivery.
import assert from 'node:assert/strict'
import {mkdirSync} from 'node:fs'
import {chromium} from 'playwright-core'
import {seed,WARDROBE} from '../src/data/seed.ts'
import {withPresentation} from '../src/data/presentation.ts'
const base=process.env.BASE??'http://127.0.0.1:5180',browser=await chromium.launch({channel:'chrome',headless:true})
mkdirSync('scripts/out/compact',{recursive:true})
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],externalWrites=[]
 let state=withPresentation(seed(),WARDROBE),version=1,creates=0,approvals=0,voiceStarts=0,popups=0,polls=0,job,bytes
 let printer={email:'fixture-desk@print.epsonconnect.com',senderEmail:'star@example.test',plainPaper:'letter',colorInk:'yes',autoDuplex:'yes',bodyPrintingOff:'yes',senderApproved:'yes',directPrint:true,updatedAt:1}
 page.on('popup',()=>popups++)
 page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR:',e.message)})
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname
  if(req.method()!=='GET'&&!path.startsWith('/api/print/')&&!['/api/workspace','/api/session','/api/fo/voice/join'].includes(path))externalWrites.push(path)
  if(path==='/api/status'||path==='/api/session')return route.fulfill({json:{provider:'live',authenticated:true,owner:true,foConnected:true,account:{id:'editing-fixture',kind:'owner'}}})
  if(path==='/api/workspace'){if(req.method()==='PUT'){state=req.postDataJSON().state;version++}return route.fulfill({json:{state,version}})}
  if(path==='/api/actions')return route.fulfill({json:{actions:[]}})
  if(path==='/api/fo/status')return route.fulfill({json:{provider:'live',state:'connected'}})
  if(path==='/api/fo/chats')return route.fulfill({json:{chats:[]}})
  if(path==='/api/intelligence')return route.fulfill({json:{checkedAt:new Date().toISOString(),model:'fixture',searched:false,sections:[{text:'Fixture outfit from your own closet.',sources:[]}]}})
  if(path==='/api/print/printer'){if(req.method()==='PUT')printer={...req.postDataJSON(),updatedAt:2};return route.fulfill({json:{printer}})}
  if(path==='/api/print/sender')return route.fulfill({json:{sender:{kind:'gmail',verified:true,ok:true,label:'star@example.test'}}})
  if(path==='/api/print/jobs'){if(req.method()==='GET')return route.fulfill({json:{jobs:job?[job]:[]}});creates++;const body=req.postDataJSON();bytes=Buffer.from(body.pdf,'base64');job={id:'fixture-12345',document:body.document,plan:{repeat:1,lines:[],limitations:[]},contentHash:'fixture-hash',pageCount:2,status:'awaiting_approval',sender:{label:'star@example.test',verified:true},address:printer.email};return route.fulfill({json:{job}})}
  if(path.endsWith('/approve')){approvals++;job={...job,status:'sending'};await new Promise(r=>setTimeout(r,1800));job={...job,status:'submitted'};return route.fulfill({json:{job}})}
  if(path.endsWith('/pdf'))return route.fulfill({contentType:'application/pdf',body:bytes})
  if(path==='/api/print/jobs/fixture-12345'){polls++;return route.fulfill({json:{job}})}
  if(path==='/api/fo/voice/join'){voiceStarts++;return route.fulfill({json:{signalUrl:'wss://livekit.api.wajo.ai',participantToken:'fixture-only',iceTransportPolicy:'relay'}})}
  if(path==='/api/gmail/status')return route.fulfill({json:{configured:false,connected:false}})
  return route.fulfill({status:503,json:{error:'Unavailable in this isolated fixture'}})
 })
 await page.route('**/src/voice/session.ts*',route=>route.fulfill({contentType:'application/javascript',body:`export async function connectVoice(join,{signal,status}){window.__voiceFixture={muted:false,ended:0};signal.addEventListener('abort',()=>window.__voiceFixture.ended++);status('Talking to Fo');return{mute:async v=>window.__voiceFixture.muted=v,enableAudio:async()=>{},hangUp:()=>window.__voiceFixture.ended++}}`}))
 await page.goto(base+'/#/trip/showcase-sydney/notebook');await page.locator('.arrival').waitFor({state:'hidden'});await page.getByRole('button',{name:'print flights',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Print from notebook'});await dialog.getByRole('button',{name:'Add ⭐ sticker',exact:true}).click()
 assert.equal(await dialog.locator('.print-decoration').getAttribute('open'),'');assert.equal(await dialog.locator('.print-settings').getAttribute('open'),null);assert.equal(await dialog.locator('iframe').count(),0);assert.equal(creates,0)
 const actions=dialog.locator('.print-final-actions');assert.equal(await actions.getByRole('link',{name:'Download PDF'}).count(),1);assert.equal(await actions.getByRole('button',{name:'Print',exact:true}).count(),1)
 await dialog.getByText('Change print settings',{exact:true}).click();assert.equal(await dialog.getByLabel('Sending email').inputValue(),'star@example.test');await dialog.getByLabel('Printer email',{exact:true}).fill('updated-fixture@print.epsonconnect.com');await dialog.getByRole('form',{name:'Print email settings'}).getByRole('button',{name:'save',exact:true}).click();await page.waitForTimeout(300);assert.equal(printer.email,'updated-fixture@print.epsonconnect.com')
 await dialog.getByLabel('Print request').fill('Print to wrong@example.test');await dialog.getByText('Use an Epson Connect printer address.',{exact:true}).waitFor();assert.equal(await actions.getByRole('button',{name:'Print',exact:true}).isDisabled(),true);assert.equal(creates,0)
 const mailSaved=page.waitForResponse(r=>r.url().endsWith('/api/print/printer')&&r.request().method()==='PUT'&&r.request().postDataJSON().email==='spoken-fixture@print.epsonconnect.com')
 await dialog.getByLabel('Print request').fill('Print from star@example.test to spoken-fixture@print.epsonconnect.com');await mailSaved;await page.waitForTimeout(200);assert.equal(printer.email,'spoken-fixture@print.epsonconnect.com')
 await dialog.getByText('Change print settings',{exact:true}).click();await actions.getByRole('button',{name:'Print',exact:true}).click();await dialog.getByText('Sent to printer email. Paper completion is unconfirmed.',{exact:true}).waitFor();assert.equal(creates,1);assert.equal(approvals,1);assert.ok(polls>=1)
 await page.screenshot({path:'scripts/out/compact/print.png',fullPage:true})
 await page.keyboard.press('Escape');await page.goto(base+'/#/new');await page.getByRole('button',{name:'call Fo',exact:true}).waitFor();assert.equal(voiceStarts,0);await page.getByRole('button',{name:'call Fo',exact:true}).click();const call=page.getByRole('dialog',{name:'Fo voice call'});await call.getByText('Talking to Fo',{exact:true}).waitFor();assert.equal(popups,0);assert.equal(voiceStarts,1)
 for(const theme of ['dark','light']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.screenshot({path:`scripts/out/compact/call-${theme}.png`})}
 await call.getByRole('button',{name:'mute',exact:true}).click();await call.getByRole('button',{name:'unmute',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__voiceFixture.muted),true);await call.getByRole('button',{name:'end call',exact:true}).click();await call.getByText('Call ended',{exact:true}).waitFor();assert.ok(await page.evaluate(()=>window.__voiceFixture.ended)>0);await call.getByRole('button',{name:'Close call'}).click();assert.equal(popups,0)
 assert.deepEqual(errors,[]);assert.deepEqual(externalWrites,[])
 console.log('Passed: decoration opens by default; settings/addresses hidden and editable; download/print-only actions; one submission with live status polling; in-app voice with mute/end and no popup. All delivery/audio transports isolated fixtures.')
}finally{await browser.close()}
