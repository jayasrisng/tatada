import { Buffer } from 'node:buffer'
import { Sealer, pkceChallenge, randomToken, sha256 } from './crypto.ts'
import type { Store } from './store.ts'
import { PrintError, PrintUncertain, type PrintDelivery, type PrintJob, type SenderCheck } from './print.ts'
import { EPSON_EMAIL } from '../src/print/plan.ts'

const SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'
const MAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
interface Tokens { epoch: number; email: string; subject: string; access: string; refresh: string; expiresAt: number }
interface Options { store: Store; sealer: Sealer; clientId?: string; clientSecret?: string; redirectUri: string; fetch?: typeof fetch; now?: () => number }
export class GmailConnection {
  private o: Options
  private refreshing = new Map<string, Promise<string>>()
  constructor(options: Options) { this.o = options }
  private now() { return this.o.now?.() ?? Date.now() }
  get configured() { return !!this.o.clientId && !!this.o.clientSecret }
  private read(owner: string): Tokens | null { try { const sealed=this.o.store.data.gmailTokens?.[owner]; return sealed ? JSON.parse(this.o.sealer.open(sealed)) : null } catch { return null } }
  status(owner: string) {
    const tokens=this.read(owner)
    return {configured:this.configured,connected:this.configured && !!tokens,email:tokens?.email,reason:!this.configured?'Gmail needs Google OAuth client configuration on the Tatada server.':!tokens?'Connect Gmail once to send PDFs to your printer.':undefined}
  }
  begin(owner: string, binding: string, returnTo: string, preferredEmail?:string) {
    if (!this.configured) throw new PrintError(503,'Gmail needs Google OAuth client configuration first.')
    const state=randomToken(), verifier=randomToken(48), now=this.now()
    const destination=/^\/trip\/[\w-]+\/print(?:\/(?:journal|flights|hotels|packing))?$/.test(returnTo)?returnTo:'/welcome'
    this.o.store.update(d=>{
      const pending=d.gmailPending??={}
      for(const [key,p]of Object.entries(pending))if(now-p.createdAt>600_000||p.owner===owner)delete pending[key]
      if(Object.keys(pending).length>=100)throw new PrintError(429,'Too many pending email connections. Try later.')
      const epochs=d.gmailEpochs??={},epoch=(epochs[owner]??0)+1;epochs[owner]=epoch
      pending[sha256(state)]={owner,binding,verifier:this.o.sealer.seal(verifier),createdAt:now,returnTo:destination,epoch}
    })
    const url=new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.search=new URLSearchParams({client_id:this.o.clientId!,redirect_uri:this.o.redirectUri,response_type:'code',scope:`openid email ${SEND_SCOPE}`,access_type:'offline',prompt:'consent',state,code_challenge:pkceChallenge(verifier),code_challenge_method:'S256'}).toString()
    if(preferredEmail&&MAIL.test(preferredEmail))url.searchParams.set('login_hint',preferredEmail)
    return url.href
  }
  /** Hosted callback is staged until the initiating authenticated tab proves its browser binding. */
  stage(state:string,code:string) {
    const stateHash=sha256(state),pending=this.o.store.data.gmailPending?.[stateHash]
    if(!pending||this.now()-pending.createdAt>600_000||!code||code.length>4096)throw new PrintError(400,'This Gmail connection expired. Connect again.')
    const exchange=randomToken(32)
    this.o.store.update(d=>{const entries=d.gmailExchanges??={};for(const [k,e]of Object.entries(entries))if(e.expiresAt<=this.now()||e.stateHash===stateHash)delete entries[k];entries[sha256(exchange)]={owner:pending.owner,stateHash,payload:this.o.sealer.seal(JSON.stringify({state,code})),expiresAt:this.now()+60000}})
    return {exchange,returnTo:pending.returnTo}
  }
  async complete(owner:string,exchange:string,binding:string) {
    const hash=sha256(exchange),entry=this.o.store.data.gmailExchanges?.[hash]
    if(!entry||entry.owner!==owner||entry.expiresAt<=this.now()||this.o.store.data.gmailPending?.[entry.stateHash]?.binding!==binding)throw new PrintError(400,'Gmail confirmation expired or belongs to another browser.')
    this.o.store.update(d=>{delete d.gmailExchanges?.[hash]})
    const {state,code}=JSON.parse(this.o.sealer.open(entry.payload)) as {state:string;code:string}
    return this.finish(owner,state,code,binding)
  }
  async finish(owner: string, state: string, code: string, binding: string) {
    const pending=this.o.store.data.gmailPending?.[sha256(state)]
    if(!this.configured||!pending||!binding||pending.owner!==owner||pending.binding!==binding||this.now()-pending.createdAt>600_000||!code||code.length>4096)throw new PrintError(400,'This Gmail connection expired or belongs to another browser. Connect again.')
    this.o.store.update(d=>{delete d.gmailPending?.[sha256(state)]})
    const response=await this.request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:this.o.clientId!,client_secret:this.o.clientSecret!,redirect_uri:this.o.redirectUri,grant_type:'authorization_code',code,code_verifier:this.o.sealer.open(pending.verifier)})})
    if(!response.ok)throw new PrintError(400,'Google did not authorize Gmail. Connect again.')
    const token=await response.json() as Record<string,unknown>
    if(typeof token.access_token!=='string'||typeof token.scope!=='string'||!token.scope.split(' ').includes(SEND_SCOPE))throw new PrintError(400,'Gmail send permission was not granted.')
    const identity=await this.request('https://openidconnect.googleapis.com/v1/userinfo',{headers:{authorization:`Bearer ${token.access_token}`}})
    if(!identity.ok)throw new PrintError(400,'Could not verify the Gmail sending account.')
    const person=await identity.json() as Record<string,unknown>
    if(typeof person.email!=='string'||!MAIL.test(person.email)||person.email_verified!==true||typeof person.sub!=='string')throw new PrintError(400,'Google did not return a verified sending email.')
    const old=this.read(owner)
    const refresh=typeof token.refresh_token==='string'?token.refresh_token:old?.subject===person.sub?old.refresh:undefined
    if(!refresh)throw new PrintError(400,'Google did not grant persistent access. Reconnect and approve offline access.')
    if(this.o.store.data.gmailEpochs?.[owner]!==pending.epoch)throw new PrintError(409,'This Gmail connection was cancelled or replaced.')
    const tokens:Tokens={epoch:pending.epoch,email:person.email,subject:person.sub,access:token.access_token,refresh,expiresAt:this.now()+Math.min(86400,Math.max(30,Number(token.expires_in)||3600))*1000}
    this.o.store.update(d=>{(d.gmailTokens??={})[owner]=this.o.sealer.seal(JSON.stringify(tokens))})
    return pending.returnTo
  }
  async disconnect(owner: string) {
    const tokens=this.read(owner)
    this.o.store.update(d=>{const epochs=d.gmailEpochs??={};epochs[owner]=(epochs[owner]??0)+1;delete d.gmailTokens?.[owner];for(const [key,e] of Object.entries(d.gmailExchanges??{}))if(e.owner===owner)delete d.gmailExchanges?.[key];for(const [key,p]of Object.entries(d.gmailPending??{}))if(p.owner===owner)delete d.gmailPending?.[key]})
    if(tokens)try{await this.request('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:tokens.refresh})})}catch{/* Local access is removed even if Google cannot be reached. */}
  }
  async access(owner: string): Promise<string> {
    if(!this.configured)throw new PrintError(409,'Configure Google OAuth before connecting Gmail.')
    const tokens=this.read(owner)
    if(!tokens)throw new PrintError(409,'Connect Gmail before printing.')
    if(tokens.expiresAt-this.now()>60_000)return tokens.access
    const active=this.refreshing.get(owner);if(active)return active
    const refresh=(async()=>{
      const response=await this.request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:this.o.clientId!,client_secret:this.o.clientSecret!,grant_type:'refresh_token',refresh_token:tokens.refresh})})
      if(!response.ok){if(response.status===400||response.status===401)this.o.store.update(d=>{delete d.gmailTokens?.[owner]});throw new PrintError(409,'Gmail needs to be reconnected before printing.')}
      const json=await response.json() as Record<string,unknown>
      if(typeof json.access_token!=='string')throw new PrintError(503,'Gmail could not refresh its authorization.')
      // A disconnect during refresh must not resurrect a credential.
      const current=this.read(owner);if(!current||current.epoch!==tokens.epoch||current.subject!==tokens.subject||current.refresh!==tokens.refresh)throw new PrintError(409,'The Gmail connection changed. Try again.')
      tokens.access=json.access_token;tokens.expiresAt=this.now()+Math.min(86400,Math.max(30,Number(json.expires_in)||3600))*1000
      this.o.store.update(d=>{(d.gmailTokens??={})[owner]=this.o.sealer.seal(JSON.stringify(tokens))})
      return tokens.access
    })()
    this.refreshing.set(owner,refresh)
    try{return await refresh}finally{this.refreshing.delete(owner)}
  }
  private request(url: string, init: RequestInit) {return (this.o.fetch??fetch)(url,{...init,signal:AbortSignal.timeout(20_000)})}
}

/** Gmail is used only for the exact approved PDF and the account's saved Epson address. */
export class GmailPrintDelivery implements PrintDelivery {
  readonly mode='gmail' as const
  private connection: GmailConnection
  private request: typeof fetch
  constructor(connection: GmailConnection, request: typeof fetch=fetch) {this.connection=connection;this.request=request}
  async sender(owner: string): Promise<SenderCheck> {
    const status=this.connection.status(owner)
    return {kind:'gmail',verified:status.connected,label:status.connected?status.email!:'Gmail not connected',ok:status.connected,reason:status.reason}
  }
  async send(owner: string, job: PrintJob, pdf: Buffer) {
    const sender=await this.sender(owner)
    if(!sender.ok||sender.label!==job.sender.label||job.sender.kind!=='gmail')return {ok:false as const,blocked:true,reason:'The Gmail sender changed. Prepare the print again.'}
    if(!EPSON_EMAIL.test(job.address))return {ok:false as const,blocked:true,reason:'Gmail print delivery only sends to an Epson printer address.'}
    let token:string
    try{token=await this.connection.access(owner)}catch{return {ok:false as const,blocked:true,reason:'Gmail authorization needs attention. Reconnect Gmail and try again.'}}
    if(!pdf.length||pdf.length>4_000_000)return {ok:false as const,blocked:true,reason:'The print PDF is invalid or too large.'}
    const boundary=`tatada-${sha256(job.id).slice(0,30)}`
    const raw=[`From: ${sender.label}`,`To: ${job.address}`,'Subject: Tatada print',`Message-ID: <tatada-${sha256(job.id)}@print.tatada.invalid>`,'MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: application/pdf','Content-Transfer-Encoding: base64',`Content-Disposition: attachment; filename="tatada-${job.document.kind}.pdf"`,'',pdf.toString('base64').match(/.{1,76}/g)!.join('\r\n'),`--${boundary}--`,''].join('\r\n')
    try{
      const response=await this.request('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({raw:Buffer.from(raw).toString('base64url')}),signal:AbortSignal.timeout(25_000)})
      if(response.status>=400&&response.status<500)return {ok:false as const,blocked:response.status===401||response.status===403,reason:response.status===429?'Gmail reached its sending limit. Try later.':'Gmail rejected this print. Check the connection and printer sender permissions.'}
      if(!response.ok)throw new PrintUncertain('Gmail did not confirm delivery. This job will not be resent automatically.')
      const result=await response.json() as {id?:unknown}
      if(typeof result.id!=='string')throw new PrintUncertain('Gmail returned no delivery receipt. This job will not be resent automatically.')
      return {ok:true as const,ref:result.id}
    }catch(e){throw e instanceof PrintUncertain?e:new PrintUncertain('The Gmail send was interrupted. This job will not be resent automatically.')}
  }
}
