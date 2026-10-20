import type {Trip} from '../types'
import {useUI} from '../state/ui'
import {OfflineDownload} from './OfflineTrip'
import {TripGuide,YosemiteChecks} from './TripGuide'

export function TripPreparation({trip}:{trip:Trip}) {
 const {mapsApp,setMapsApp}=useUI()
 return <details className="trip-preparation"><summary>Before you go · packing, maps &amp; offline</summary>
  {trip.planGuide&&<TripGuide guide={trip.planGuide}/>}
  <details className="offline-map-help"><summary>Directions &amp; offline maps</summary>
   <label>Open directions with<select aria-label="Open directions with" className="chalk-input" value={mapsApp} onChange={e=>setMapsApp(e.target.value as 'google'|'apple')}><option value="google">Google Maps</option><option value="apple">Apple Maps</option></select></label>
   <p className="small">Download the map area on your phone before leaving. Include {trip.planning?.origin?`${trip.planning.origin}, `:''}{trip.destination} and the whole route between them.</p>
   {mapsApp==='apple'?<><p className="small">In Apple Maps on iPhone: tap your picture → Offline Maps → add a map. Search for your destination, adjust the area and download.</p><a href="https://support.apple.com/en-us/105084" target="_blank" rel="noreferrer">Apple’s offline map guide ↗</a></>:<><p className="small">In the Google Maps mobile app: tap your picture → Offline maps → Select your own map. Choose the area and download. Offline navigation covers driving; walking and shuttle directions need a connection.</p><a href="https://support.google.com/maps/answer/6291838?hl=en" target="_blank" rel="noreferrer">Google’s offline map guide ↗</a></>}
   {/yosemite/i.test(trip.destination)&&<p className="small"><a href="https://www.nps.gov/yose/planyourvisit/maps.htm" target="_blank" rel="noreferrer">Save an official Yosemite PDF map ↗</a> · Open the map and save it to Files or Downloads for park reference.</p>}
   <p className="small dim">Map downloads stay in your Maps app or Files. ChattaDa’s trip download below saves your itinerary, guidance and available confirmations.</p>
  </details>
  <OfflineDownload trip={trip}/>
  <YosemiteChecks destination={trip.destination}/>
 </details>
}
