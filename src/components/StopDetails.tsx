import {lazy,Suspense} from 'react'
import type {ItineraryItem,Trip} from '../types'
import {useUI} from '../state/ui'
import {stopDirections} from '../assistant/stop'

const DocumentVault=lazy(()=>import('./DocumentVault').then(m=>({default:m.DocumentVault})))

export function StopDetails({stop,trip,previous,onRemove}:{stop:ItineraryItem;trip:Trip;previous?:ItineraryItem;onRemove:()=>void}) {
 const {mapsApp}=useUI()
 const maps=stopDirections(stop,trip,previous)
 const entry=/entry|entrance|park pass|enter yosemite/i.test(stop.title+' '+(stop.note??''))&&/yosemite/i.test(trip.destination)
 return <details className="stop-details"><summary>details</summary>
  {stop.note&&<p className="small">{stop.note.split('\n').map((line,i)=>line.startsWith('Source: https://')?<a key={i} href={line.slice(8).trim()} target="_blank" rel="noreferrer">source ↗</a>:<span key={i}>{line}<br/></span>)}</p>}
  <nav className="stop-map-links" aria-label={`Directions for ${stop.title}`}><a href={maps[mapsApp]} target="_blank" rel="noreferrer">directions ↗</a></nav>
  {/shuttle/i.test(stop.title)&&<p className="small dim">Maps open the destination. Follow the park’s shuttle stops and service notices for the bus.</p>}
  {entry&&<div className="stop-pass"><h4>Park pass &amp; ID</h4><p className="small">Have your park pass and matching photo ID ready, or buy entry by card at the gate.</p><a href="https://www.nps.gov/yose/planyourvisit/fees.htm" target="_blank" rel="noreferrer">Passes &amp; entry fees ↗</a><details className="stop-private-pass"><summary>Show a saved pass or ID</summary><Suspense fallback={<p className="small">Opening private documents…</p>}><DocumentVault/></Suspense></details></div>}
  <button className="linkbtn small" onClick={onRemove}>remove stop</button>
 </details>
}
