import type {ItineraryItem,Trip} from '../types'

export function stopSentence(title:string) {
 const fixed: Record<string,string>={
  'Milpitas → Big Oak Flat entrance':'Drive from Milpitas to the Big Oak Flat entrance.',
  'Big Oak Flat · park entry':'Enter Yosemite at Big Oak Flat.',
  'Cook’s Meadow · easy first walk':'Walk the Cook’s Meadow loop.',
  'Lunch · Degnan’s Kitchen':'Have lunch at Degnan’s Kitchen.',
  'Shuttle toward Mirror Lake':'Take the shuttle to Mirror Lake.',
  'Mirror Lake · short out-and-back':'Hike the short Mirror Lake out-and-back.',
  'Shuttle back · collect your car':'Take the shuttle back and collect your car.',
  'El Capitan Meadow · optional pause':'Stop at El Capitan Meadow if you have time.',
  'Continue west · Valley View pullout':'Continue west toward Valley View.',
  'Valley View · last short stop':'Pause at Valley View if you have time.',
  'Drive home · Yosemite → Milpitas':'Drive home to Milpitas.',
  'Milpitas · home arrival target':'Arrive home in Milpitas.',
 }
 if(fixed[title])return fixed[title]
 const meal=title.match(/^(Breakfast|Lunch|Dinner)\s*(?:at|·|—|:)\s*(.+)$/i)
 if(meal)return `Have ${meal[1].toLowerCase()} at ${meal[2].replace(/[.!?]+$/,'')}.`
 const clean=title.replace(/\s*·\s*/g,', ').replace(/[.!?]+$/,'')
 return `${clean}.`
}
export function stopPlace(stop:ItineraryItem,trip:Trip) {
 const t=stop.title
 if(/yosemite/i.test(trip.destination)) {
  if(/home|arriv.*Milpitas/i.test(t))return trip.planning?.origin||'Milpitas, California'
  if(/big oak flat.*(?:entrance|entry)|enter.*big oak flat/i.test(t))return 'Big Oak Flat Entrance, Yosemite National Park'
  if(/cook.s meadow/i.test(t))return 'Cooks Meadow Loop, Yosemite National Park'
  if(/degnan/i.test(t))return 'Degnans Kitchen, Yosemite Village'
  if(/shuttle back|collect your car|village.*parking|drive into yosemite/i.test(t))return 'Yosemite Village day-use parking, Yosemite National Park'
  if(/mirror lake/i.test(t))return 'Mirror Lake Trailhead, Yosemite National Park'
  if(/el capitan|drive west.*northside/i.test(t))return 'El Capitan Meadow, Yosemite National Park'
  if(/valley view/i.test(t))return 'Valley View, Yosemite National Park'
 }
 const place=t.replace(/^(?:have (?:breakfast|lunch|dinner) at|(?:walk|hike|visit|explore|see|enjoy)(?: to| at| around)?|drive to|arrive at|stop at|take the shuttle to)\s+/i,'').replace(/[.!?]+$/,'')
 return `${place}, ${trip.destination}`
}
export function stopDirections(stop:ItineraryItem,trip:Trip,previous?:ItineraryItem) {
 const destination=stopPlace(stop,trip),origin=previous?stopPlace(previous,trip):trip.planning?.origin
 const walking=/walk|hike|meadow|lunch|dinner|restaurant/i.test(stop.title)&&!/drive|entrance/i.test(stop.title)
 const google=new URL('https://www.google.com/maps/dir/');google.searchParams.set('api','1');google.searchParams.set('destination',destination);google.searchParams.set('travelmode',walking?'walking':'driving')
 const apple=new URL('https://maps.apple.com/');apple.searchParams.set('daddr',destination);apple.searchParams.set('dirflg',walking?'w':'d')
 if(origin&&origin!==destination){google.searchParams.set('origin',origin);apple.searchParams.set('saddr',origin)}
 return {google:google.href,apple:apple.href,destination}
}
export function stopScope(trip:Trip,stopId:string,finishedAt?:string) {
 const ordered=[...(trip.itinerary??[])].sort((a,b)=>(a.day+(a.time??'')).localeCompare(b.day+(b.time??'')))
 const index=ordered.findIndex(i=>i.id===stopId);if(index<0)throw Error('This stop changed. Open its Magic chat again.')
 const stop=ordered[index]
 if(finishedAt&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(finishedAt))throw Error('The update needs a valid finish time.')
 if(finishedAt&&stop.time&&finishedAt<stop.time)throw Error('The finish time is earlier than this stop. Tell Magic the corrected time.')
 return {day:stop.day,time:finishedAt||stop.time||'00:00',preserved:ordered.filter((i,n)=>n<index||i.done||!!finishedAt&&n===index),replaceIds:ordered.filter((i,n)=>n>=index&&!i.done&&(!finishedAt||n!==index)).map(i=>i.id)}
}
