import {mkdirSync,writeFileSync} from 'node:fs'
import {presentationTrips} from '../src/data/presentation.ts'
const base='http://127.0.0.1:5180'
if(!process.argv.includes('--apply'))throw new Error('Pass --apply for the local owner example.')
const status=await(await fetch(base+'/api/status')).json()
if(!status.owner||!status.authenticated||status.provider!=='live')throw new Error('Local live owner account required.')
const current=await(await fetch(base+'/api/workspace')).json(), old=current.state?.trips.find(t=>t.id==='showcase-la'&&t.presentation)
if(!old)throw new Error('Existing LA example required.')
mkdirSync('.data/presentation-backups',{recursive:true,mode:0o700})
writeFileSync(`.data/presentation-backups/before-la-journey-${Date.now()}.json`,JSON.stringify(current),{mode:0o600,flag:'wx'})
const sample=presentationTrips().find(t=>t.id===old.id), sampleIds=new Set(sample.itinerary.map(i=>i.id))
const trip={...old,arrival:sample.arrival,localAddress:old.localAddress||sample.localAddress,summary:{...sample.summary,...old.summary},bookings:[...sample.bookings.map(b=>old.bookings.find(o=>o.id===b.id)??b),...old.bookings.filter(b=>!sample.bookings.some(s=>s.id===b.id))],itinerary:[...sample.itinerary.map(i=>({...i,...old.itinerary?.find(o=>o.id===i.id)})),...(old.itinerary??[]).filter(i=>!sampleIds.has(i.id)&&!/^showcase-la-[0-2]-(breakfast|day|lunch|evening)$/.test(i.id))]}
const state={...current.state,trips:current.state.trips.map(t=>t.id===old.id?trip:t)}
const response=await fetch(base+'/api/workspace',{method:'PUT',headers:{'content-type':'application/json','x-tatada':'1',origin:base},body:JSON.stringify({baseVersion:current.version,state})})
if(!response.ok)throw new Error(`Not saved: HTTP ${response.status}`)
console.log(JSON.stringify({saved:true,example:true,arrangements:trip.bookings.length,stops:trip.itinerary.length,otherTripsPreserved:true}))
