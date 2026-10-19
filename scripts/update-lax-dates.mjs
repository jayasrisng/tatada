// Targeted owner-requested schedule change; never submits a booking/provider action.
import {mkdirSync,writeFileSync} from 'node:fs'
import {presentationTrips} from '../src/data/presentation.ts'
const base='http://127.0.0.1:5180'
if(!process.argv.includes('--apply'))throw Error('Pass --apply to update the owner example.')
const status=await(await fetch(base+'/api/status')).json()
if(!status.owner||!status.authenticated||status.provider!=='live')throw Error('Local owner account required.')
const current=await(await fetch(base+'/api/workspace')).json(),old=current.state?.trips.find(t=>t.id==='showcase-la'&&t.presentation)
if(!old)throw Error('LA example not found.')
const sample=presentationTrips().find(t=>t.id===old.id)
if(old.start===sample.start&&old.end===sample.end&&old.destination===sample.destination){console.log('LAX dates already updated.');process.exit(0)}
const retime=day=>{if(!day||day<old.start||day>old.end)return day;if(day===old.end)return sample.end;const delta=(Date.parse(day+'T12:00:00Z')-Date.parse(old.start+'T12:00:00Z'))/86400000;return new Date(Date.parse(sample.start+'T12:00:00Z')+delta*86400000).toISOString().slice(0,10)}
const text=v=>typeof v==='string'?v.replace(/\d{4}-\d{2}-\d{2}/g,retime).replace(/Oct 24[–-]26/g,'Oct 19–25').replace(/Two nights|two nights/g,'Six nights').replace('home on Monday','home on Sunday'):v
const bookings=old.bookings.map(b=>!b.simulated?b:{...b,when:text(b.when),at:b.at?retime(b.at.slice(0,10))+b.at.slice(10):b.at,checkIn:retime(b.checkIn),checkOut:retime(b.checkOut),arrivesAt:b.arrivesAt?retime(b.arrivesAt.slice(0,10))+b.arrivesAt.slice(10):b.arrivesAt,detail:text(b.detail)})
const ids=new Set(sample.itinerary.map(i=>i.id)),itinerary=[...sample.itinerary.map(i=>({...i,...old.itinerary?.find(o=>o.id===i.id),day:i.day})),...(old.itinerary??[]).filter(i=>!ids.has(i.id)).map(i=>({...i,day:retime(i.day)}))].sort((a,b)=>(a.day+(a.time??'')).localeCompare(b.day+(b.time??'')))
const trip={...old,destination:sample.destination,start:sample.start,end:sample.end,arrival:old.arrival?retime(old.arrival.slice(0,10))+old.arrival.slice(10):sample.arrival,bookings,itinerary,summary:Object.fromEntries(Object.entries(old.summary).map(([k,v])=>[k,text(v)])),research:undefined,memories:old.memories.map(m=>m.id===old.id+'-prompt'?{...m,day:retime(m.day)}:m)}
const state={...current.state,trips:current.state.trips.map(t=>t.id===old.id?trip:t),items:current.state.items.map(i=>i.tripId===old.id?{...i,text:text(i.text),note:text(i.note)}:i),looks:current.state.looks?.map(l=>l.tripId===old.id?{...l,day:retime(l.day)}:l)}
mkdirSync('.data/presentation-backups',{recursive:true,mode:0o700})
writeFileSync(`.data/presentation-backups/before-lax-dates-${Date.now()}.json`,JSON.stringify(current),{mode:0o600,flag:'wx'})
const response=await fetch(base+'/api/workspace',{method:'PUT',headers:{'content-type':'application/json','x-tatada':'1',origin:base},body:JSON.stringify({baseVersion:current.version,state})})
if(!response.ok)throw Error(`Update refused: ${response.status}`)
const saved=await(await fetch(base+'/api/workspace')).json();if(saved.state?.trips.find(t=>t.id===old.id)?.start!==sample.start)throw Error('Schedule verification failed.')
console.log('Saved LAX, October 19–25. Updated sample arrangements, itinerary, outfit dates and task text. Other trips and actual memories preserved; no provider actions.')
