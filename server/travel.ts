import { ActionError } from './actions.ts'
interface Options { clientId: string; clientSecret: string; environment: 'test' | 'production'; fetch?: typeof fetch; now?: () => number }
const date = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v+'T00:00:00Z')) && new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v
/** Read-only provider boundary. No order creation, payment, check-in or loyalty endpoints. */
export class AmadeusTravel {
  private o: Options
  private token?: { value: string; expiresAt: number }
  private refreshing?: Promise<string>
  constructor(o:Options) { this.o=o }
  capabilities() {return {provider:'Amadeus',environment:this.o.environment,flightStatus:true,inventory:true,booking:false,checkIn:false,loyalty:false}}
  private get base() { return this.o.environment==='production'?'https://api.amadeus.com':'https://test.api.amadeus.com' }
  private async access():Promise<string> {
    const now=this.o.now?.()??Date.now()
    if(this.token&&this.token.expiresAt>now+30000)return this.token.value
    if(this.refreshing)return this.refreshing
    this.refreshing=(async()=>{const r=await (this.o.fetch??fetch)(`${this.base}/v1/security/oauth2/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:this.o.clientId,client_secret:this.o.clientSecret}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw new ActionError(503,'Travel provider authentication needs attention.');const b=await r.json() as {access_token?:string;expires_in?:number};if(typeof b.access_token!=='string'||typeof b.expires_in!=='number')throw new ActionError(503,'Travel provider returned an unsupported credential response.');this.token={value:b.access_token,expiresAt:now+b.expires_in*1000};return b.access_token})()
    try {return await this.refreshing}finally{this.refreshing=undefined}
  }
  private async get(path:string,params:Record<string,string>) {
    try {
      const token=await this.access(),r=await (this.o.fetch??fetch)(`${this.base}${path}?${new URLSearchParams(params)}`,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)})
      if(r.status===401)this.token=undefined
      if(!r.ok)throw new ActionError(r.status===429?429:503,'Travel data is unavailable. Your saved reservation has not changed.')
      const body=await r.json() as {data?:unknown[]}
      if(!Array.isArray(body.data))throw new ActionError(503,'Travel provider returned an unsupported response.')
      return body.data
    } catch(e) {if(e instanceof ActionError)throw e;throw new ActionError(503,'Travel provider could not respond. No booking or payment was attempted.')}
  }
  async flightStatus(carrier:string,number:string,departureDate:string) {
    if(!/^[A-Z0-9]{2,3}$/.test(carrier)||!/^\d{1,4}$/.test(number)||!date(departureDate))throw new ActionError(400,'Use the exact airline code, flight number and departure-local date from your confirmation.')
    const data=await this.get('/v2/schedule/flights',{carrierCode:carrier,flightNumber:number,scheduledDepartureDate:departureDate})
    const flights=data.slice(0,20).map(value=>{
      const f=value as {scheduledDepartureDate?:string;flightDesignator?:{carrierCode?:string;flightNumber?:number|string};flightPoints?:{iataCode?:string;departure?:{timings?:{qualifier?:string;value?:string}[]};arrival?:{timings?:{qualifier?:string;value?:string}[]}}[]}
      if(f.flightDesignator?.carrierCode!==carrier||String(Number(f.flightDesignator.flightNumber))!==String(Number(number))||f.scheduledDepartureDate!==departureDate)throw new ActionError(503,'Provider flight identity did not match the requested reservation.')
      return {date:f.scheduledDepartureDate,carrier,number,points:(f.flightPoints??[]).slice(0,10).map(p=>({airport:p.iataCode,departure:p.departure?.timings?.map(t=>({kind:t.qualifier,time:t.value})),arrival:p.arrival?.timings?.map(t=>({kind:t.qualifier,time:t.value}))}))}
    })
    return {provider:'Amadeus',environment:this.o.environment,checkedAt:new Date(this.o.now?.()??Date.now()).toISOString(),flights}
  }
  async searchOffers(from:string,to:string,departureDate:string,adults:number) {
    if(!/^[A-Z]{3}$/.test(from)||!/^[A-Z]{3}$/.test(to)||from===to||!date(departureDate)||!Number.isInteger(adults)||adults<1||adults>9)throw new ActionError(400,'Supply airport codes, a departure date and 1–9 adults.')
    const offers=await this.get('/v2/shopping/flight-offers',{originLocationCode:from,destinationLocationCode:to,departureDate,adults:String(adults),max:'5'})
    return {provider:'Amadeus',environment:this.o.environment,checkedAt:new Date(this.o.now?.()??Date.now()).toISOString(),offers:offers.slice(0,5).map(value=>{
      const o=value as {id?:string;price?:{currency?:string;total?:string};lastTicketingDate?:string;numberOfBookableSeats?:number;itineraries?:{duration?:string;segments?:{departure?:{iataCode?:string;at?:string};arrival?:{iataCode?:string;at?:string};carrierCode?:string;number?:string;duration?:string}[]}[]}
      return {id:o.id,currency:o.price?.currency,total:o.price?.total,lastTicketingDate:o.lastTicketingDate,seats:o.numberOfBookableSeats,itineraries:(o.itineraries??[]).slice(0,4).map(i=>({duration:i.duration,segments:(i.segments??[]).slice(0,8).map(s=>({from:s.departure?.iataCode,to:s.arrival?.iataCode,departure:s.departure?.at,arrival:s.arrival?.at,carrier:s.carrierCode,number:s.number,duration:s.duration}))}))}
    }),notice:'Provider offers only. Availability and price require revalidation; no reservation has been made. Coverage varies by airline; student discounts are not verified by this search.'}
  }
}
