// Explicit readiness probe: one live Fo room, no microphone publication or audio playback.
import {chromium} from 'playwright-core'
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5180/',{waitUntil:'domcontentloaded'})
 const result=await page.evaluate(async()=>{
  const module=await(await fetch('/src/voice/session.ts')).text(),match=/from ["']([^"']*livekit-client[^"']*)/.exec(module)
  if(!match)throw Error('Voice SDK unavailable')
  const {Room}=await import(match[1]),response=await fetch('/api/fo/voice/join',{method:'POST',headers:{'x-tatada':'1'}})
  if(!response.ok)throw Error('Provider voice readiness failed')
  const join=await response.json(),room=new Room()
  try{await room.connect(join.signalUrl,join.participantToken,{rtcConfig:{iceTransportPolicy:join.iceTransportPolicy}});await new Promise(r=>setTimeout(r,1200));return{connected:room.state==='connected',foPresent:room.remoteParticipants.size>0,microphonePublished:room.localParticipant.isMicrophoneEnabled,audioPlayed:false,tokenStored:false}}
  finally{await room.disconnect(true)}
 })
 if(!result.connected||result.microphonePublished)throw Error('Unexpected voice readiness result')
 console.log(JSON.stringify(result))
}finally{await browser.close()}
