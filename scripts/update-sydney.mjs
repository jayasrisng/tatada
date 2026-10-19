// Apply the owner-requested two-person Sydney example, preserving other trips and personal additions.
import {mkdirSync,writeFileSync} from 'node:fs'
import {presentationTrips} from '../src/data/presentation.ts'
const base='http://127.0.0.1:5180'
if(!process.argv.includes('--apply'))throw new Error('Pass --apply to update the local owner account.')
const status=await (await fetch(base+'/api/status')).json()
if(!status.owner||!status.authenticated||status.provider!=='live')throw new Error('Local live owner account required.')
const current=await (await fetch(base+'/api/workspace')).json()
const old=current.state?.trips.find(t=>t.id==='showcase-sydney'&&t.presentation)
if(!old)throw new Error('Existing owner Sydney example not found; no data changed.')
mkdirSync('.data/presentation-backups',{recursive:true,mode:0o700})
writeFileSync(`.data/presentation-backups/before-sydney-${Date.now()}.json`,JSON.stringify(current),{mode:0o600,flag:'wx'})
const example=presentationTrips().find(t=>t.id===old.id)
const updated={...old,...example,research:old.research,memories:[...example.memories,...old.memories.filter(m=>!m.id.startsWith(old.id+'-journal-'))],bookings:[...example.bookings,...old.bookings.filter(b=>!b.id.startsWith(old.id+'-'))]}
const state={...current.state,trips:current.state.trips.map(t=>t.id===old.id?updated:t.presentation?{...t,bookings:t.bookings.map(b=>{const match=presentationTrips().find(p=>p.id===t.id)?.bookings.find(p=>p.id===b.id);return b.kind==='flight'&&b.simulated&&match?.flight?{...b,flight:match.flight}:b})}:t)}
const response=await fetch(base+'/api/workspace',{method:'PUT',headers:{'content-type':'application/json','x-tatada':'1',origin:base},body:JSON.stringify({baseVersion:current.version,state})})
if(!response.ok)throw new Error(`Not saved: HTTP ${response.status}`)
console.log(JSON.stringify({saved:true,travelers:updated.travelers,activities:updated.itinerary.length,journalMoments:updated.memories.length,otherTripsPreserved:true}))
