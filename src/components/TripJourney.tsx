import {ItineraryPlanner} from './ItineraryPlanner'
import {TripCalendar} from './TripCalendar'
import {DeleteTrip} from './DeleteTrip'
import {nextTravelStep} from '../travel/next'
import {NextStep} from './NextStep'
import {lazy,Suspense,useState} from 'react'
import {humanDate, humanWhen} from '../travel/display'
import {JourneyStage} from './JourneyStage'
import {useStore} from '../state/store'
import {useUI} from '../state/ui'
import type {Booking, Trip, JourneyStep} from '../types'
import {FlightTicket} from './FlightTicket'
import {Doodle} from './Doodle'
import {MomentComposer} from './MomentComposer'
import {TripResearch} from './TripResearch'
import {ChecklistRow} from './Checklist'

const TravelArrangements=lazy(()=>import('./TravelArrangements').then(m=>({default:m.TravelArrangements})))

export function TripJourney({trip}:{trip:Trip}) {
  const [manageOpened,setManageOpened]=useState(false)
  const {state,dispatch}=useStore(), {openMagic}=useUI()
  const road=trip.planning?.transport==='drive'||trip.planning?.transport==='rental-car'
  const flights=trip.bookings.filter(b=>b.kind==='flight').sort((a,b)=>(a.at??a.when).localeCompare(b.at??b.when))
  const stays=trip.bookings.filter(b=>b.kind==='stay'), transfers=trip.bookings.filter(b=>b.kind==='transfer'), meals=trip.bookings.filter(b=>b.kind==='dinner')
  const tasks=state.items.filter(i=>i.tripId===trip.id&&!i.done).sort((a,b)=>Number(!!b.priority)-Number(!!a.priority))
  const talk=(title:string)=>openMagic({tripId:trip.id,assistant:true,prefill:`For my ${trip.destination} trip, help me with ${title}.`})
  const magic=(title:string)=><button className="iconbtn" aria-label={`Talk to Fo about ${title}`} onClick={()=>talk(title)}><Doodle name="sparkle" size={20}/></button>
  const stages: {step:JourneyStep;title:string}[] = [
    {step:'flight',title:road?'Getting there':'Your flight'}, ...((trip.arrival||transfers.length||flights.length)?[{step:'arrival' as const,title:road?'Getting around':'Arrival'}]:[]),
    ...(stays.length?[{step:'stay' as const,title:'Drop your bags'}]:[]), ...(meals.length?[{step:'days' as const,title:'Saved meals'}]:[]),
    ...(flights.length>1?[{step:'onward' as const,title:'The way onward'}]:[]),
  ]
  const relevant=nextTravelStep(trip)
  const current = stages.find(s=>s.step===relevant?.stage)??stages.find(s=>!trip.journeyDone?.[s.step])
  const stageProps = (step:JourneyStep) => ({
    id:`${trip.id}-stage-${step}`,title:stages.find(s=>s.step===step)!.title,
    done:!!trip.journeyDone?.[step],current:current?.step===step,
    onComplete:()=>dispatch({type:'toggleJourneyStep',tripId:trip.id,step}),
  })
  const record=(b:Booking)=><div key={b.id} className="journey-record"><div><strong>{b.title}</strong><p>{humanWhen(b.when)}</p><p className="dim">{b.detail}</p>{b.address&&<p>{b.address}</p>}{b.ref&&<code>{b.ref}</code>}{b.simulated&&<small>sample plan</small>}</div>{magic(`${b.title}, ${b.when}`)}</div>
  return <div className="trip-journey">
    <ItineraryPlanner key={trip.id+'-planner'} trip={trip}/><NextStep trip={trip}/><section aria-label="Your journey">
      <ol className="journey-steps">
        <JourneyStage {...stageProps('flight')} action={magic('my flight')}>{road?<p>{trip.planning?.transport==='rental-car'?'Rental-car journey':'Drive'}{trip.planning?.origin?` from ${trip.planning.origin}`:''}{trip.planning?.arriveBy?` · arrive by ${trip.planning.arriveBy}`:''}. Route and rental details are in your itinerary.</p>:flights[0]?<FlightTicket booking={flights[0]} trip={trip} profile={state.profile}/>:<p className="journey-empty">No flight saved.</p>}</JourneyStage>
        {(trip.arrival||transfers.length>0||flights.length>0)&&<JourneyStage {...stageProps('arrival')} action={magic('arrival and getting to my stay')}><p>{trip.arrival?`Arrival: ${humanDate(trip.arrival.slice(0,10))} · ${trip.arrival.slice(11)}`:'Arrival time isn’t saved yet.'}</p>{transfers.length?transfers.map(record):<p className="journey-empty">No ride saved.</p>}</JourneyStage>}
        {stays.length>0&&<JourneyStage {...stageProps('stay')} action={magic('where I am staying and check-in')}>{stays.length?stays.map(b=><div key={b.id}>{record(b)}<dl className="journey-stay-dates"><dt>Check in</dt><dd>{b.checkIn?humanDate(b.checkIn):'Not saved'}</dd><dt>Check out</dt><dd>{b.checkOut?humanDate(b.checkOut):'Not saved'}</dd></dl></div>):<p className="journey-empty">No stay saved.</p>}{trip.localAddress&&!stays.some(b=>b.address)&&<p className="small">{trip.localAddress}</p>}</JourneyStage>}
        {meals.length>0&&<JourneyStage {...stageProps('days')} action={magic('saved meals')}>{meals.map(record)}</JourneyStage>}
        {flights.slice(1).length>0&&<JourneyStage {...stageProps('onward')} action={magic('check-in for my return flight')}>{flights.slice(1).map(b=><FlightTicket key={b.id} booking={b} trip={trip} profile={state.profile}/>)}</JourneyStage>}
      </ol>
    </section>
    {tasks.length>0&&<details className="journey-tasks"><summary>{tasks.length} things still to do</summary><ul className="checklist">{tasks.map(item=><ChecklistRow key={item.id} item={item}/>)}</ul></details>}
    <details className="manage-arrangements" onToggle={e=>{if(e.currentTarget.open)setManageOpened(true)}}><summary>Add or edit travel details</summary>{manageOpened&&<Suspense fallback={<p>Opening travel details…</p>}><TravelArrangements key={trip.id} trip={trip}/></Suspense>}</details>
    <TripResearch trip={trip}/>

    <details className="journey-photo"><summary>A photo and a few words</summary><MomentComposer trip={trip}/></details>
    <TripCalendar trip={trip}/><DeleteTrip trip={trip}/>
  </div>
}
