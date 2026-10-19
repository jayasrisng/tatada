import { Sealer, pkceChallenge, randomToken, sha256 } from './crypto.ts'
import type { Store } from './store.ts'
import {ActionError} from './actions.ts'

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created'
const MAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
interface Tokens { epoch: number; email: string; subject: string; access: string; refresh: string; expiresAt: number }
interface Options { store: Store; sealer: Sealer; clientId?: string; clientSecret?: string; redirectUri: string; fetch?: typeof fetch; now?: () => number }
export class CalendarConnection {
  private o: Options
  private refreshing = new Map<string, Promise<string>>()
  constructor(options: Options) { this.o = options }
  private now() { return this.o.now?.() ?? Date.now() }
  get configured() { return !!this.o.clientId && !!this.o.clientSecret }
  private read(owner: string): Tokens | null { try { const sealed=this.o.store.data.calendarTokens?.[owner]; return sealed ? JSON.parse(this.o.sealer.open(sealed)) : null } catch { return null } }
  status(owner: string) {
    const tokens=this.read(owner)
    return {configured:this.configured,connected:this.configured && !!tokens,email:tokens?.email,reason:!this.configured?'Google Calendar needs Google OAuth client configuration on the Tatada server.':!tokens?'Connect Google Calendar to add reviewed trip plans.':undefined}
  }
  begin(owner: string, binding: string, returnTo: string, preferredEmail?:string) {
    if (!this.configured) throw new ActionError(503,'Google Calendar needs Google OAuth client configuration first.')
    const state=randomToken(), verifier=randomToken(48), now=this.now()
    const destination=/^\/trip\/[\w-]+$/.test(returnTo)?returnTo:'/welcome'
    this.o.store.update(d=>{
      const pending=d.calendarPending??={}
      for(const [key,p]of Object.entries(pending))if(now-p.createdAt>600_000||p.owner===owner)delete pending[key]
      if(Object.keys(pending).length>=100)throw new ActionError(429,'Too many pending email connections. Try later.')
      const epochs=d.calendarEpochs??={},epoch=(epochs[owner]??0)+1;epochs[owner]=epoch
      pending[sha256(state)]={owner,binding,verifier:this.o.sealer.seal(verifier),createdAt:now,returnTo:destination,epoch}
    })
    const url=new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.search=new URLSearchParams({client_id:this.o.clientId!,redirect_uri:this.o.redirectUri,response_type:'code',scope:`openid email ${CALENDAR_SCOPE}`,access_type:'offline',prompt:'consent',state,code_challenge:pkceChallenge(verifier),code_challenge_method:'S256'}).toString()
    if(preferredEmail&&MAIL.test(preferredEmail))url.searchParams.set('login_hint',preferredEmail)
    return url.href
  }
  /** Hosted callback is staged until the initiating authenticated tab proves its browser binding. */
  stage(state:string,code:string) {
    const stateHash=sha256(state),pending=this.o.store.data.calendarPending?.[stateHash]
    if(!pending||this.now()-pending.createdAt>600_000||!code||code.length>4096)throw new ActionError(400,'This Google Calendar connection expired. Connect again.')
    const exchange=randomToken(32)
    this.o.store.update(d=>{const entries=d.calendarExchanges??={};for(const [k,e]of Object.entries(entries))if(e.expiresAt<=this.now()||e.stateHash===stateHash)delete entries[k];entries[sha256(exchange)]={owner:pending.owner,stateHash,payload:this.o.sealer.seal(JSON.stringify({state,code})),expiresAt:this.now()+60000}})
    return {exchange,returnTo:pending.returnTo}
  }
  async complete(owner:string,exchange:string,binding:string) {
    const hash=sha256(exchange),entry=this.o.store.data.calendarExchanges?.[hash]
    if(!entry||entry.owner!==owner||entry.expiresAt<=this.now()||this.o.store.data.calendarPending?.[entry.stateHash]?.binding!==binding)throw new ActionError(400,'Google Calendar confirmation expired or belongs to another browser.')
    this.o.store.update(d=>{delete d.calendarExchanges?.[hash]})
    const {state,code}=JSON.parse(this.o.sealer.open(entry.payload)) as {state:string;code:string}
    return this.finish(owner,state,code,binding)
  }
  async finish(owner: string, state: string, code: string, binding: string) {
    const pending=this.o.store.data.calendarPending?.[sha256(state)]
    if(!this.configured||!pending||!binding||pending.owner!==owner||pending.binding!==binding||this.now()-pending.createdAt>600_000||!code||code.length>4096)throw new ActionError(400,'This Google Calendar connection expired or belongs to another browser. Connect again.')
    this.o.store.update(d=>{delete d.calendarPending?.[sha256(state)]})
    const response=await this.request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:this.o.clientId!,client_secret:this.o.clientSecret!,redirect_uri:this.o.redirectUri,grant_type:'authorization_code',code,code_verifier:this.o.sealer.open(pending.verifier)})})
    if(!response.ok)throw new ActionError(400,'Google did not authorize Google Calendar. Connect again.')
    const token=await response.json() as Record<string,unknown>
    if(typeof token.access_token!=='string'||typeof token.scope!=='string'||!token.scope.split(' ').includes(CALENDAR_SCOPE))throw new ActionError(400,'Google Calendar app-calendar permission was not granted.')
    const identity=await this.request('https://openidconnect.googleapis.com/v1/userinfo',{headers:{authorization:`Bearer ${token.access_token}`}})
    if(!identity.ok)throw new ActionError(400,'Could not verify the Google Calendar account.')
    const person=await identity.json() as Record<string,unknown>
    if(typeof person.email!=='string'||!MAIL.test(person.email)||person.email_verified!==true||typeof person.sub!=='string')throw new ActionError(400,'Google did not return a verified account email.')
    const old=this.read(owner)
    const refresh=typeof token.refresh_token==='string'?token.refresh_token:old?.subject===person.sub?old.refresh:undefined
    if(!refresh)throw new ActionError(400,'Google did not grant persistent access. Reconnect and approve offline access.')
    if(this.o.store.data.calendarEpochs?.[owner]!==pending.epoch)throw new ActionError(409,'This Google Calendar connection was cancelled or replaced.')
    const tokens:Tokens={epoch:pending.epoch,email:person.email,subject:person.sub,access:token.access_token,refresh,expiresAt:this.now()+Math.min(86400,Math.max(30,Number(token.expires_in)||3600))*1000}
    this.o.store.update(d=>{(d.calendarTokens??={})[owner]=this.o.sealer.seal(JSON.stringify(tokens))})
    return pending.returnTo
  }
  pending(state:string) {return !!this.o.store.data.calendarPending?.[sha256(state)]}
  identity(owner:string) {const t=this.read(owner);if(!t)throw new ActionError(409,'Connect Google Calendar first.');return sha256(t.subject)}
  async disconnect(owner: string) {
    this.o.store.update(d=>{const epochs=d.calendarEpochs??={};epochs[owner]=(epochs[owner]??0)+1;delete d.calendarTokens?.[owner];for(const [key,e] of Object.entries(d.calendarExchanges??{}))if(e.owner===owner)delete d.calendarExchanges?.[key];for(const [key,p]of Object.entries(d.calendarPending??{}))if(p.owner===owner)delete d.calendarPending?.[key]})
    // Google can revoke every scope for this shared client. Remove Calendar access locally
    // without unexpectedly revoking the separate Gmail print connection.

  }
  async access(owner: string): Promise<string> {
    if(!this.configured)throw new ActionError(409,'Configure Google OAuth before connecting Google Calendar.')
    const tokens=this.read(owner)
    if(!tokens)throw new ActionError(409,'Connect Google Calendar before adding trip events.')
    if(tokens.expiresAt-this.now()>60_000)return tokens.access
    const active=this.refreshing.get(owner);if(active)return active
    const refresh=(async()=>{
      const response=await this.request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:this.o.clientId!,client_secret:this.o.clientSecret!,grant_type:'refresh_token',refresh_token:tokens.refresh})})
      if(!response.ok){if(response.status===400||response.status===401)this.o.store.update(d=>{delete d.calendarTokens?.[owner]});throw new ActionError(409,'Google Calendar needs to be reconnected before adding trip events.')}
      const json=await response.json() as Record<string,unknown>
      if(typeof json.access_token!=='string')throw new ActionError(503,'Google Calendar could not refresh its authorization.')
      // A disconnect during refresh must not resurrect a credential.
      const current=this.read(owner);if(!current||current.epoch!==tokens.epoch||current.subject!==tokens.subject||current.refresh!==tokens.refresh)throw new ActionError(409,'The Google Calendar connection changed. Try again.')
      tokens.access=json.access_token;tokens.expiresAt=this.now()+Math.min(86400,Math.max(30,Number(json.expires_in)||3600))*1000
      this.o.store.update(d=>{(d.calendarTokens??={})[owner]=this.o.sealer.seal(JSON.stringify(tokens))})
      return tokens.access
    })()
    this.refreshing.set(owner,refresh)
    try{return await refresh}finally{this.refreshing.delete(owner)}
  }
  private request(url: string, init: RequestInit) {return (this.o.fetch??fetch)(url,{...init,signal:AbortSignal.timeout(20_000)})}
}


import {tripCalendarEvents} from '../src/travel/calendar.ts'
import type {Trip} from '../src/types.ts'
export class CalendarService {
  private busy=new Set<string>()
  private store:Store
  readonly connection:CalendarConnection
  private fetcher:typeof fetch
  constructor(store:Store,connection:CalendarConnection,fetcher:typeof fetch=fetch){this.store=store;this.connection=connection;this.fetcher=fetcher}
  preview(owner:string,tripId:string){
    const state=this.store.data.workspaces[owner]?.state as {trips?:Trip[]}|undefined
    const trip=state?.trips?.find(t=>t.id===tripId)
    if(!trip)throw new ActionError(404,'Save this trip before adding it to Calendar.')
    const events=tripCalendarEvents(trip)
    return {events,previewHash:sha256(JSON.stringify(events)),notice:'All-day entries include saved local times in their descriptions. Booking references, private notes, contacts and attendees are excluded. Additions only: existing calendar events are not changed.'}
  }
  async add(owner:string,tripId:string,previewHash:string,keys:string[]){
    if(this.busy.has(owner))throw new ActionError(409,'Calendar is already adding this account’s events. Wait for the result.')
    const preview=this.preview(owner,tripId)
    if(preview.previewHash!==previewHash)throw new ActionError(409,'The trip changed. Review the Calendar preview again.')
    if(!keys.length||keys.length>30||new Set(keys).size!==keys.length||keys.some(k=>!preview.events.some(e=>e.key===k)))throw new ActionError(400,'Choose 1–30 reviewed events.')
    const subject=this.connection.identity(owner),epoch=this.store.data.calendarEpochs?.[owner]
    const deadline=Date.now()+60000
    let uncertain=false
    this.busy.add(owner)
    const connected=()=>{if(this.connection.identity(owner)!==subject||this.store.data.calendarEpochs?.[owner]!==epoch)throw new ActionError(409,'Calendar connection changed. Review before continuing.')}
    const request=async(path:string,init:RequestInit)=>{connected();if(Date.now()>=deadline)throw new ActionError(503,'Calendar batch time limit reached. Retry the same selected events.');const token=await this.connection.access(owner);connected();if(Date.now()>=deadline)throw new ActionError(503,'Calendar batch time limit reached.');return this.fetcher('https://www.googleapis.com/calendar/v3'+path,{...init,headers:{...init.headers,authorization:`Bearer ${token}`,'content-type':'application/json'},signal:AbortSignal.timeout(Math.max(1,Math.min(15000,deadline-Date.now())))})}
    try{
      this.store.update(d=>{(d.calendarWrites??={})[owner]={tripId,state:'running'}});await this.store.flush()
      let link=this.store.data.calendarLinks?.[owner]
      if(link&&link.subject!==subject)link=undefined
      if(link&&link.state!=='ready')throw new ActionError(409,'Calendar creation is unresolved. Check Google Calendar before trying again; Tatada will not create another calendar blindly.')
      if(!link){
        this.store.update(d=>{(d.calendarLinks??={})[owner]={subject,state:'creating'}});await this.store.flush()
        try{
          const response=await request('/calendars',{method:'POST',body:JSON.stringify({summary:'Tatada',description:'Reviewed trip plans added from Tatada. All-day entries preserve saved local times as text.',timeZone:'UTC'})})
          if(!response.ok){if(response.status>=400&&response.status<500)this.store.update(d=>{delete d.calendarLinks?.[owner]});throw new ActionError(503,'Google Calendar could not create the Tatada calendar. Check API access and consent.')}
          const json=await response.json() as {id?:string}
          if(!json.id||json.id.length>500)throw new ActionError(503,'Google returned an unsupported calendar response.')
          connected();link={subject,state:'ready',id:json.id};const saved=link;this.store.update(d=>{(d.calendarLinks??={})[owner]=saved});await this.store.flush()
        }catch(e){if(this.store.data.calendarLinks?.[owner]?.state==='creating'){this.store.update(d=>{d.calendarLinks![owner].state='uncertain'});await this.store.flush()}throw e}
      }
      if(!link.id)throw new ActionError(409,'The Tatada calendar needs attention.')
      const result={created:0,alreadyPresent:0,conflicts:0,failed:0}
      for(const event of preview.events.filter(e=>keys.includes(e.key))){
        const id=sha256(`${owner}:${subject}:${tripId}:${event.key}`),{key,...content}=event,fingerprint=sha256(JSON.stringify(content)),path=`/calendars/${encodeURIComponent(link.id)}/events`
        try{
          // Recheck the saved source and grant immediately before every external write.
          if(this.preview(owner,tripId).previewHash!==previewHash)throw new ActionError(409,'Trip changed during Calendar export. Review the remaining events again.')
          const r=await request(`${path}?sendUpdates=none`,{method:'POST',body:JSON.stringify({...content,id,visibility:'private',transparency:'transparent',reminders:{useDefault:false},extendedProperties:{private:{tatadaFingerprint:fingerprint}}})})
          if(r.ok)result.created++
          else if(r.status===409){const existing=await request(`${path}/${id}`,{method:'GET'});const body=existing.ok?await existing.json() as {summary?:string;description?:string;location?:string;start?:{date?:string};end?:{date?:string};status?:string;extendedProperties?:{private?:{tatadaFingerprint?:string}}}:null;if(body?.status!=='cancelled'&&body?.extendedProperties?.private?.tatadaFingerprint===fingerprint&&body?.summary===content.summary&&body?.description===content.description&&(body?.location??'')===(content.location??'')&&body?.start?.date===content.start.date&&body?.end?.date===content.end.date)result.alreadyPresent++;else result.conflicts++}
          else result.failed++
        }catch{result.failed++;uncertain=true}
      }
      return {...result,notice:'No invitations were sent. Existing or edited Calendar events were not overwritten. After a timeout, retrying the same reviewed events uses the same event IDs to avoid duplicates.'}
    }finally{this.busy.delete(owner);this.store.update(d=>{if(uncertain||d.calendarLinks?.[owner]?.state==='uncertain'){if(d.calendarWrites?.[owner])d.calendarWrites[owner].state='uncertain'}else delete d.calendarWrites?.[owner]});await this.store.flush()}
  }
}
