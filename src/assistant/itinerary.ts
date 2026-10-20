import type { Profile, Trip, ItineraryItem, PlanGuide } from '../types'

export interface PlanOption { title: string; note: string; url?: string; rating?: string; distance?: string }
export interface PlanStop { time?: string; kind: 'activity' | 'meal' | 'flight' | 'transfer' | 'rest'; options: PlanOption[] }
export interface TripPlan { essentials?: Omit<PlanGuide,'checkedAt'>; days: { day: string; stops: PlanStop[] }[] }
const dateValid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0,10) === s
export function planDays(start: string, end: string) {
  if (!dateValid(start) || !dateValid(end) || start > end) throw Error('Choose valid trip dates.')
  const days: string[] = []
  for (let at = Date.parse(`${start}T00:00:00Z`); at <= Date.parse(`${end}T00:00:00Z`); at += 86400000) {
    if (days.length === 31) throw Error('Plan up to 31 days at a time. Split a longer journey into trips.')
    days.push(new Date(at).toISOString().slice(0,10))
  }
  return days
}
const shortText = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max
export function parseTripPlan(text: string, start: string, end: string, revision = false): TripPlan {
  const block = text.match(/```(?:json|tatada-itinerary)\s*\n([\s\S]*?)```/)
  let value: TripPlan
  try { value = JSON.parse(block ? block[1] : text.trim()) } catch { throw Error('The plan was not complete. Try again with fewer details.') }
  const days = planDays(start,end)
  if (!value || !Array.isArray(value.days) || value.days.length !== days.length) throw Error('The plan must cover every trip day. Try again.')
  let essentials: TripPlan['essentials']
  if (value.essentials !== undefined) {
    const e=value.essentials
    if(!e||!shortText(e.summary,1600)||!Array.isArray(e.packing)||e.packing.length>30||!e.packing.every(v=>shortText(v,200))||!Array.isArray(e.notes)||e.notes.length>12)throw Error('The trip essentials were incomplete. Try again.')
    essentials={summary:e.summary,packing:e.packing,notes:e.notes.map(n=>{
      if(!n||!shortText(n.title,180)||!shortText(n.text,1200))throw Error('A good-to-know note is incomplete.')
      let url: string|undefined
      if(n.url){try{const u=new URL(n.url);if(u.protocol!=='https:'||u.username||u.password)throw Error();url=u.href}catch{throw Error('A trip guidance source is invalid.')}}
      return {title:n.title,text:n.text,...(url?{url}:{})}
    })}
  }
  return {...(essentials?{essentials}:{}),days: days.map(day => {
    const matches = value.days.filter(d => d?.day === day)
    if (matches.length !== 1 || !Array.isArray(matches[0].stops) || matches[0].stops.length < (revision ? 0 : 1) || matches[0].stops.length > 16) throw Error('Each day needs its own complete plan.')
    let previousTime=''
    return {day, stops: matches[0].stops.map(stop => {
      if (!stop || !['activity','meal','flight','transfer','rest'].includes(stop.kind) || !Array.isArray(stop.options) || !stop.options.length || stop.options.length > 3 || (stop.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(stop.time))) throw Error('A stop in the plan needs a valid time and choices.')
      if(!stop.time||stop.time<previousTime)throw Error('The route needs a time for every stop, in travel order. Try again.')
      previousTime=stop.time
      return {kind: stop.kind, time: stop.time, options: (stop.kind==='transfer'?stop.options.slice(0,1):stop.options).map(option => {
        if (!option || !shortText(option.title,180) || !shortText(option.note,1200)) throw Error('A plan option is incomplete.')
        if(/^(?:wake up|breakfast(?: & a slow start)?|lunch(?:, water & a proper break)?|dinner(?: & a little journal time)?|free time|explore the area|arrive, settle in & take a short walk)$/i.test(option.title.trim()))throw Error('The plan needs named places, not a generic daily routine. Try again.')
        let url: string | undefined
        if (option.url) { try { const u = new URL(option.url); if (u.protocol !== 'https:' || u.username || u.password) throw Error(); url = u.href } catch { throw Error('A source link in the plan is invalid.') } }
        // Ratings and distances must have an accompanying source, never stand alone as facts.
        return {title:option.title.trim(),note:option.note.trim(),...(url ? {url} : {}),...(url && shortText(option.rating,80) ? {rating:option.rating} : {}),...(url && shortText(option.distance,120) ? {distance:option.distance} : {})}
      })}
    })}
  })}
}
export function planningContext(trip: Trip, profile: Profile) {
  const context={destination:trip.destination,country:trip.country,dates:planDays(trip.start,trip.end),travelers:trip.travelers,budget:trip.budget,journey:trip.planning,homeBases:profile.homeBases,interests:trip.vibe,needs:trip.constraints,memberships:trip.discounts,homeAirport:profile.homeAirport,diet:profile.diet,travelStyle:profile.style,base:trip.localAddress || trip.bookings.find(b=>b.kind==='stay'&&!b.simulated)?.address,arrival:trip.arrival,savedStops:trip.itinerary?.map(i=>({id:i.id,day:i.day,time:i.time,title:i.title,note:i.note?.slice(0,300),done:i.done})),savedTravel:trip.bookings.filter(b=>!b.simulated).map(b=>({kind:b.kind,title:b.title,at:b.at,arrivesAt:b.arrivesAt,flight:b.flight}))}
  const output=()=>JSON.stringify(context)
  if(output().length>7700)context.savedStops=context.savedStops?.map(i=>({...i,note:undefined}))
  if(output().length>7700)context.savedStops=context.savedStops?.slice(0,24)
  if(output().length>7700)throw Error('Too many trip details for one request. Shorten the trip preferences before planning.')
  return output()
}
export const itineraryPrompt = `Build a geographically coherent, destination-specific timed route. Match the trip: a family visit, city break and park day should have different rhythms. Use only worthwhile stops; never force the same number, meal pattern or daily routine onto every trip. Never use filler such as wake up, slow start, explore the area, lunch break, dinner and journal, or free time as activity titles. Name the actual trail, meadow, museum, neighborhood or restaurant. Every activity and meal must explain why it fits this part of the route; include time allocated, access/parking and the next transfer. Order stops along a plausible route, with explicit timed entrance/pass, parking, walking/shuttle connections and homebound travel where applicable. Meal alternatives must be nearby named venues with verified diet options or an honest menu-check caveat. Durations and driving times may be clearly labeled planning estimates, never live traffic. Distinguish main stops from optional stops and say which to drop first if delayed; never compensate by rushing a hike or unsafe driving. Do not suggest car collection when the car is already arranged. Build a complete day-by-day itinerary for EVERY date in the context. Use short everyday language. Stop titles should be short action sentences such as "Walk the Cook’s Meadow loop." Keep logistics, source facts and pass instructions in notes, not titles. Include arrival/landing only when relevant to an actual travel leg, never as a daily formula. Each option note should be at most two short sentences. Keep the essentials summary under 100 words and each good-to-know note under 50 words. Respect diet, budget, accessibility needs, saved arrangements and arrival/departure; do not repeat already saved stops. Cluster nearby places with realistic travel time and breaks. Transfer choices must complete the same leg; never offer a snack, rest, or viewpoint instead of a required drive or shuttle. Give only one option for each transfer, entrance, parking step or homebound drive. Give 2–3 alternatives for meal stops, explaining vegetarian/diet fit and proximity to the supplied base; if no base is supplied say proximity unknown. Only include flight options when the traveler explicitly wants to fly. Driving, rental-car and same-day local trips must not get flights or hotel suggestions. For rental cars check pickup opening hours and whether collecting the car the previous evening is needed for an early start. These are researched route options, never reservations. Exact prices, flight times, ratings and distances may ONLY appear when supported by current source pages for the actual route/dates or place. Otherwise omit them. Search official airline/place/menu sources. Prefer a short useful plan over a packed schedule. For longer trips use fewer stops per day to finish every date. Return ONLY a fenced tatada-itinerary JSON block with this schema: {"days":[{"day":"YYYY-MM-DD","stops":[{"kind":"meal|activity|flight|transfer|rest","time":"HH:mm","options":[{"title":"name","note":"why it fits, logistics and what needs checking","url":"https://source-page","rating":"source-reported rating, optional","distance":"sourced distance, optional"}]}]}]}. Every new stop needs an HH:mm time in chronological order. Source URLs, rating and distance are optional; never invent them. Also include a top-level "essentials":{"summary":"feasibility and time budget","packing":["practical item"],"notes":[{"title":"topic","text":"actionable guidance","url":"https://official-source"}]}. Include roads/driving and rental restrictions; destination forecast for the actual dates and elevation (never substitute current home weather); permits/entry/parking and trail closures; hike duration/difficulty/turnaround times; food/water; phone signal and offline downloads. Search official park/road/weather sources for changing facts. If a forecast or condition cannot be verified, state that and provide its official check page. Describe trail logistics without destination photos or scenic spoilers. Prefer browser-accessible official maps/downloads over extra apps; recommend an optional app only for a specific offline or safety benefit. For a single-day trip, budget outbound and return driving, parking, meals and breaks within the actual home-to-home window; distinguish 12 hours total from 12 hours at the destination. State if arrival/home deadlines are infeasible and offer a smaller route. Prioritize one realistic hike over squeezing in every sight. Return drive must be a timed stop. When constraints say something changed, propose a revised safe plan and preserve already completed activities. For revisions, output only remaining stops at or after the supplied resume day/time, include empty stops arrays for completed days, and never repeat finished or preserved stops. Keep the original homebound deadline; shorten or drop optional activities before shifting essential travel. Max sixteen stops/day, three options/stop, title 180 chars, note 1200 chars. JSON strings must be valid. Do not book, purchase, send messages, or change calendars.`
export function selectedPlanItems(plan: TripPlan, choices: Record<string,number>, prefix: string): ItineraryItem[] {
  return plan.days.flatMap(d=>d.stops.flatMap((s,i)=>{
    const index=choices[`${d.day}:${i}`] ?? 0
    if(index===-1)return []
    const option=s.options[index]
    if(!option)throw Error('Choose a valid option for each stop.')
    return [{id:`${prefix}-${d.day}-${i}`,day:d.day,time:s.time,title:option.title,dress:'casual' as const,note:[option.note,option.rating&&`Source rating: ${option.rating}`,option.distance&&`Distance: ${option.distance}`,option.url&&`Source: ${option.url}`].filter(Boolean).join('\n')}]
  }))
}

/** The stop just finished and its preceding route remain intact during a delay revision. */
export function revisionBoundary(trip: Trip, stopId: string, finishedAt: string) {
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(finishedAt))throw Error('Enter the time you finished this stop.')
 const ordered=[...(trip.itinerary??[])].sort((a,b)=>(a.day+(a.time??'')).localeCompare(b.day+(b.time??'')))
 const index=ordered.findIndex(i=>i.id===stopId)
 if(index<0)throw Error('This stop changed. Select it again.')
 const stop=ordered[index]
 if(stop.time&&finishedAt<stop.time)throw Error('Finish time must be after the scheduled start. For another change, use change plans.')
 return {day:stop.day,time:finishedAt,stopId,preserveIds:ordered.slice(0,index+1).map(i=>i.id),replaceIds:ordered.slice(index+1).filter(i=>!i.done).map(i=>i.id)}
}
export function remainingPlan(plan: TripPlan, boundary: {day:string;time:string}, preserved: ItineraryItem[]): TripPlan {
 return {...plan,days:plan.days.map(d=>({...d,stops:d.stops.filter(s=>{
  if(d.day<boundary.day)return false
  if(d.day===boundary.day&&(!s.time||s.time<boundary.time))throw Error('The revised plan starts before you finished. Try again.')
  return !s.options.some(o=>preserved.some(p=>p.day===d.day&&p.title.toLowerCase()===o.title.toLowerCase()))
 })}))}
}
