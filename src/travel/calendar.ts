import type {Trip} from '../types.js'
const isIsoDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v
const isTime=(v:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v)
export interface CalendarEvent {key:string;summary:string;description:string;location?:string;start:{date:string};end:{date:string}}
const nextDay=(day:string)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)}
/** All-day entries preserve saved local times as text, without inventing durations/time zones. */
export function tripCalendarEvents(trip:Trip):CalendarEvent[]{
 const out:CalendarEvent[]=[]
 for(const b of trip.bookings){
  const day=b.checkIn??b.at?.slice(0,10)
  if(!day||!isIsoDate(day))continue
  const end=b.kind==='stay'&&b.checkOut&&isIsoDate(b.checkOut)&&b.checkOut>day?b.checkOut:nextDay(day)
  const time=b.at?.slice(11)
  out.push({key:'booking-'+b.id,summary:`${b.simulated?'[Sample] ':''}${b.title}`,description:[`Tatada trip: ${trip.destination}`,b.simulated?'Sample plan; not a reservation.':'Saved travel plan; check your provider for changes.',`Saved schedule: ${b.when}`,time&&isTime(time)?`Local time: ${time}${b.departureZone?' ('+b.departureZone+')':''}`:'',b.arrivesAt?`Saved arrival: ${b.arrivesAt}${b.arrivalZone?' ('+b.arrivalZone+')':''}`:'','All-day calendar entry; saved times are shown above. Booking references, contacts and private notes are excluded.'].filter(Boolean).join('\n'),location:b.address,start:{date:day},end:{date:end}})
 }
 for(const item of trip.itinerary??[]){if(!isIsoDate(item.day))continue;out.push({key:'stop-'+item.id,summary:`${trip.presentation||trip.demoScenario?'[Sample] ':''}${item.title}`,description:`${trip.presentation||trip.demoScenario?'Sample itinerary; not a confirmed reservation.\n':''}Tatada trip: ${trip.destination}${item.time?'\nSaved local time: '+item.time+(trip.timeZone?' ('+trip.timeZone+')':''):''}\nAll-day calendar entry. Check your saved itinerary for exact timing. Private notes are excluded.`,start:{date:item.day},end:{date:nextDay(item.day)}})}
 return out.slice(0,100)
}
const esc=(s:string)=>s.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,')
function fold(line:string){const parts:string[]=[];let chunk='',bytes=0;for(const c of line){const size=new TextEncoder().encode(c).length;if(bytes+size>73){parts.push(chunk);chunk=' ';bytes=1}chunk+=c;bytes+=size}parts.push(chunk);return parts.join('\r\n')}
export function calendarFile(tripId:string,events:CalendarEvent[],now=new Date()):string{
 const stamp=now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Tatada//Trip plans//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH',...events.flatMap(e=>['BEGIN:VEVENT',`UID:${encodeURIComponent(tripId)}-${encodeURIComponent(e.key)}@tatada.local`,`DTSTAMP:${stamp}`,`DTSTART;VALUE=DATE:${e.start.date.replaceAll('-','')}`,`DTEND;VALUE=DATE:${e.end.date.replaceAll('-','')}`,`SUMMARY:${esc(e.summary)}`,`DESCRIPTION:${esc(e.description)}`,...(e.location?[`LOCATION:${esc(e.location)}`]:[]),'TRANSP:TRANSPARENT','END:VEVENT']),'END:VCALENDAR',''].map(fold).join('\r\n')
}
