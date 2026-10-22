import type {ItineraryItem,Profile,Trip} from '../types'
export type StopKind='food'|'stay'|'transport'|'waterfall'|'work'|'activity'
export function stopKind(text:string):StopKind {
 if(/\b(breakfast|lunch|dinner|brunch|eat|restaurant|café|cafe|coffee|meal|kitchen|bakery)\b/i.test(text))return 'food'
 if(/\b(hotel|check.in|lodging|overnight|airbnb)\b/i.test(text))return 'stay'
 if(/\b(drive|flight|airport|train|shuttle|transfer|bus|parking)\b/i.test(text))return 'transport'
 if(/waterfall|\bfalls?\b/i.test(text))return 'waterfall'
 if(/meeting|conference|office|cowork/i.test(text))return 'work'
 return 'activity'
}
export const mealStops=(trip:Trip)=>(trip.itinerary??[]).filter(s=>stopKind(s.title)==='food')
export const directions=(name:string,destination:string)=>`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(name+', '+destination)}`
export function mealContext(trip:Trip,profile:Profile){return JSON.stringify({destination:trip.destination,country:trip.country,start:trip.start,end:trip.end,diet:profile.diet,needs:profile.personalNeeds??[],pace:profile.style,budget:trip.budget,constraints:trip.constraints,route:trip.itinerary?.map(s=>({day:s.day,time:s.time,title:s.title,note:s.note?.slice(0,180)})),stays:trip.bookings.filter(b=>b.kind==='stay').map(b=>({name:b.title,address:b.address}))}).slice(0,7900)}
export interface MealOption{name:string;why:string;food:string;dietNote:string;address:string;url:string}
export interface MealSlot{day:string;meal:string;area:string;options:MealOption[]}
export function parseMeals(text:string,trip:Pick<Trip,'start'|'end'>):MealSlot[]{
 const clean=text.replace(/^```(?:json)?\s*|\s*```$/g,'').trim();const data=JSON.parse(clean) as {meals?:unknown}
 if(!Array.isArray(data.meals))throw Error('Could not read meal choices. Try a shorter request.')
 const slots:MealSlot[]=[]
 for(const row of data.meals.slice(0,93)){
  if(!row||typeof row!=='object')continue
  const r=row as Record<string,unknown>
  if(typeof r.day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.day)||r.day<trip.start||r.day>trip.end||!['breakfast','lunch','dinner'].includes(String(r.meal))||!Array.isArray(r.options))continue
  const options=r.options.slice(0,3).filter((o):o is MealOption=>!!o&&typeof o==='object'&&['name','why','food','dietNote','address','url'].every(k=>typeof o[k]==='string')&&o.name.trim().length>0).map(o=>({...o,url:/^https:\/\//i.test(o.url)?o.url:''}))
  if(options.length)slots.push({day:r.day,meal:String(r.meal),area:typeof r.area==='string'?r.area:'Area unverified',options})
 }
 if(!slots.length)throw Error('No meal choices matched these trip dates.')
 return slots
}
export function mealItem(slot:MealSlot,option:MealOption,id:string,sourceLinked:boolean):ItineraryItem{return {id,day:slot.day,time:{breakfast:'08:00',lunch:'12:00',dinner:'19:00'}[slot.meal],title:`${slot.meal[0].toUpperCase()+slot.meal.slice(1)} at ${option.name}`,dress:'casual',note:[option.address,option.food,option.why,option.dietNote,'Suggested meal time; adjust around your itinerary.',sourceLinked?`Source: ${option.url}`:'Unverified suggestion; confirm menu and hours.'].join('\n')}}
