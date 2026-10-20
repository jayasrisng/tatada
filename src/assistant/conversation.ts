export type TripTool='flights'|'stays'|'confirmation'|'plan'|'chat'
export function tripTool(message:string):TripTool {
 if(/\b(book|reserve|confirmation|boarding|check.?in|ticket)\b/i.test(message))return 'confirmation'
 if(/\b(flight|flights|airfare)\b/i.test(message)&&/\b(check|search|compare|find|return|options)\b/i.test(message))return 'flights'
 if(/\b(hotel|hotels|airbnb|stay|stays|accommodation)\b/i.test(message)&&/\b(check|search|compare|find|options)\b/i.test(message))return 'stays'
 if(/\b(itinerary|schedule)\b/i.test(message)||/\b(build|plan|restructure)\b.*\b(days|trip|plan)\b/i.test(message))return 'plan'
 return 'chat'
}
export async function requestTripLocation():Promise<{lat:number;lon:number}> {
 if(!navigator.geolocation)throw Error('Location is unavailable. Tell Magic your current place instead.')
 return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(p=>resolve({lat:Number(p.coords.latitude.toFixed(2)),lon:Number(p.coords.longitude.toFixed(2))}),()=>reject(Error('Location could not be shared. Type your current place instead.')),{timeout:12000,maximumAge:0,enableHighAccuracy:false}))
}
