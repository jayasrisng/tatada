import {randomUUID} from 'node:crypto'
import {randomToken,sha256} from './crypto.ts'
import {ActionError} from './actions.ts'
import {BETA_VERSION} from '../shared/release.ts'
export {BETA_VERSION}
export interface BetaGateway {inspect(token:string):Promise<unknown>;activate(token:string,email:string,password:string):Promise<void>;admin(actor:string,action:string,args?:Record<string,unknown>):Promise<unknown>;feedback(actor:string,body:Record<string,unknown>):Promise<unknown>}
const secretPattern=/(?:eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_secret_|tatada-recovery_|[?&#](?:access_token|refresh_token|token|code)=|(?:passport|password|api[_ -]?key|access[_ -]?token|booking[_ -]?(?:reference|number))\s*[:=])/i
export function feedbackInput(body:Record<string,unknown>){
 const message=typeof body.message==='string'?body.message.trim():''
 if(message.length<5||message.length>2000||secretPattern.test(message)||/https?:\/\//i.test(message))throw new ActionError(400,'Describe the problem without passwords, tokens, links, passport details or private travel data (5–2000 characters).')
 const category=['account','saving','layout','downloads','other'].includes(String(body.category))?String(body.category):'other'
 const page=typeof body.page==='string'&&/^\/(?:home|welcome|trips|trip\/:id(?:\/(?:itinerary|packing|notebook|journal|print))?|tasks|closet|journal|policies|other)$/.test(body.page)?body.page:'/other'
 return {message,category,page,severity:body.severity==='critical'?'critical':'normal',device:body.device==='phone'?'phone':'desktop',version:BETA_VERSION}
}
export class SupabaseBeta implements BetaGateway {
 private o:{url:string;serviceKey:string;fetch?:typeof fetch}
 constructor(o:{url:string;serviceKey:string;fetch?:typeof fetch}){this.o=o}
 private async rpc(action:string,actor:string|null,args:Record<string,unknown>={}){
  const response=await(this.o.fetch??fetch)(`${this.o.url}/rest/v1/rpc/tatada_beta`,{method:'POST',headers:{apikey:this.o.serviceKey,authorization:`Bearer ${this.o.serviceKey}`,'content-type':'application/json'},body:JSON.stringify({p_action:action,p_actor:actor,p_args:args}),signal:AbortSignal.timeout(12000)})
  if(!response.ok)throw new ActionError(503,'Private beta storage is unavailable. Try again later.')
  const result=await response.json() as Record<string,unknown>
  if(result.error){const error=String(result.error);throw new ActionError(error==='owner_required'||error==='denied'?403:error==='capacity'?409:error==='rate'?429:400,error==='capacity'?'All ten tester slots are reserved. Revoke an unused invitation first.':error==='rate'?'Feedback limit reached. Try again later.':error==='owner_exists'?'An owner already exists or has a pending setup link.':'This invitation or operation is unavailable.')}
  return result
 }
 private hash(token:string){if(!/^[\w-]{43}$/.test(token))throw new ActionError(400,'This invitation is invalid or unavailable.');return sha256(token)}
 inspect(token:string){return this.rpc('inspect',null,{hash:this.hash(token)})}
 async activate(token:string,email:string,password:string){
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||password.length<12||password.length>72)throw new ActionError(400,'Use an email login label and a password of 12–72 characters.')
  const hash=this.hash(token),nonce=randomUUID(),link=await this.rpc('begin',null,{hash,nonce})
  // This is technical confirmation to avoid SMTP, NOT proof of email ownership.
  // UID + private invitation claim own the workspace; email is only a login label.
  const response=await(this.o.fetch??fetch)(`${this.o.url}/auth/v1/admin/users`,{method:'POST',headers:{apikey:this.o.serviceKey,authorization:`Bearer ${this.o.serviceKey}`,'content-type':'application/json'},body:JSON.stringify({email,password,email_confirm:true,app_metadata:{tatada_prototype:true,tatada_password_reset:randomUUID(),tatada_beta_invitation:link.id,tatada_beta_claim:nonce,tatada_email_ownership_verified:false}}),signal:AbortSignal.timeout(15000)})
  if(!response.ok){if(response.status>=400&&response.status<500)await this.rpc('failed',null,{hash,nonce});throw new ActionError(400,'Activation could not be confirmed. Check your details, try signing in if already activated, or contact the owner.')}
  // Do not return provider data, credentials, tokens, or the new user's email.
 }
 async admin(actor:string,action:string,args:Record<string,unknown>={}){
  if(action==='create'){const token=randomToken(32),result=await this.rpc('create',actor,{hash:sha256(token)});return {...result,token}}
  if(!['list','revoke','resolve'].includes(action))throw new ActionError(400,'Unknown beta operation.')
  if(action!=='list'&&(!/^[a-f0-9-]{36}$/i.test(String(args.id))))throw new ActionError(400,'Choose an existing entry.')
  return this.rpc(action,actor,args)
 }
 feedback(actor:string,body:Record<string,unknown>){return this.rpc('feedback',actor,feedbackInput(body))}
}
