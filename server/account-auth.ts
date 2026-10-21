import {Buffer} from 'node:buffer'
import {randomToken,sha256,canonical} from './crypto.ts'
import {ActionError} from './actions.ts'
import type {Store} from './store.ts'
export interface Principal {id:string;sessionId:string;sessionCreatedAt:number;mfaAt?:number;hasTotp:boolean;passwordChangeRequired?:boolean;passwordChange?:{nonce:string;changedAt:string|null}}
export interface IdentityGateway {publicConfig:{mode:'supabase';url:string;publicKey:string;prototype?:true;login?:'password';testerLimit?:10};verify(token:string):Promise<Principal|null>;changePassword?(token:string,p:Principal,current:string,password:string):Promise<void>;deleteUser?(id:string):Promise<void>}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const MFA_WINDOW=5*60_000
/** getUser authoritatively verifies the token before any JWT claim is used.
 * The service-only RPC additionally rejects externally revoked/expired sessions.
 */
export class SupabaseIdentity implements IdentityGateway {
 publicConfig:IdentityGateway['publicConfig']
 private key:string;private request:typeof fetch
 constructor(o:{url:string;publicKey:string;serviceKey:string;fetch?:typeof fetch}){const url=new URL(o.url);if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Auth requires HTTPS');if(!o.publicKey||!o.serviceKey||o.publicKey===o.serviceKey||o.publicKey.startsWith('sb_secret_'))throw Error('Separate public and server authentication keys are required');try{if(JSON.parse(Buffer.from(o.publicKey.split('.')[1]??'','base64url').toString()).role==='service_role')throw new ActionError(500,'A service key cannot be exposed as a public key')}catch(e){if(e instanceof ActionError)throw e}this.publicConfig={mode:'supabase',url:url.origin,publicKey:o.publicKey,prototype:true,login:'password',testerLimit:10};this.key=o.serviceKey;this.request=o.fetch??fetch}
 async deleteUser(id:string){if(!UUID.test(id))throw Error('Invalid account ID');const response=await this.request(`${this.publicConfig.url}/auth/v1/admin/users/${id}`,{method:'DELETE',headers:{apikey:this.key,authorization:`Bearer ${this.key}`},signal:AbortSignal.timeout(10000)});if(!response.ok&&response.status!==404)throw Error('Identity deletion is pending.')}
 async changePassword(token:string,p:Principal,current:string,password:string){
  if(!p.passwordChangeRequired||!p.passwordChange||!current||password.length<12||password.length>1024||current.length>1024||password===current)throw new ActionError(400,'Use your current password and a different new password of at least 12 characters.')
  // User-scoped Auth API enforces the configured current-password policy and
  // rejects reuse. Credentials exist only in this request, never the Store/logs.
  const response=await this.request(`${this.publicConfig.url}/auth/v1/user`,{method:'PUT',headers:{apikey:this.publicConfig.publicKey,authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({current_password:current,password}),signal:AbortSignal.timeout(10000)})
  if(!response.ok)throw new ActionError(403,'Password change failed. Check the current password and authenticator, or contact the owner.')
  const user=await response.json() as {id?:string};if(user.id!==p.id)throw new ActionError(503,'Password change could not be confirmed. Contact the owner.')
  const complete=await this.request(`${this.publicConfig.url}/rest/v1/rpc/tatada_complete_password_change`,{method:'POST',headers:{apikey:this.key,authorization:`Bearer ${this.key}`,'content-type':'application/json'},body:JSON.stringify({p_user:p.id,p_session:p.sessionId,p_nonce:p.passwordChange.nonce,p_changed_before:p.passwordChange.changedAt}),signal:AbortSignal.timeout(10000)})
  if(!complete.ok||await complete.json()!==true)throw new ActionError(409,'The account changed during password rotation. Contact the owner for a new temporary password.')
 }
 async verify(token:string):Promise<Principal|null>{
  if(!token||token.length>16000||token.split('.').length!==3)return null
  const response=await this.request(`${this.publicConfig.url}/auth/v1/user`,{headers:{apikey:this.publicConfig.publicKey,authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)})
  if([401,403].includes(response.status))return null
  if(!response.ok)throw new ActionError(503,'Identity verification is unavailable. Try again later.')
  const user=await response.json() as {id?:string;email_confirmed_at?:string;factors?:{factor_type:string;status:string}[]}
  let claims:Record<string,unknown>;try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString())}catch{return null}
  if(claims.aud!=='authenticated'&&!(Array.isArray(claims.aud)&&claims.aud.includes('authenticated')))return null
  if(!user.id||!UUID.test(user.id)||!user.email_confirmed_at||claims.sub!==user.id||claims.iss!==`${this.publicConfig.url}/auth/v1`||claims.role!=='authenticated'||typeof claims.exp!=='number'||claims.exp*1000<=Date.now()||typeof claims.session_id!=='string'||!UUID.test(claims.session_id))return null
  const active=await this.request(`${this.publicConfig.url}/rest/v1/rpc/tatada_prototype_session_active`,{method:'POST',headers:{apikey:this.key,authorization:`Bearer ${this.key}`,'content-type':'application/json'},body:JSON.stringify({p_user:user.id,p_session:claims.session_id}),signal:AbortSignal.timeout(10000)})
  if(!active.ok)throw new ActionError(503,'Authentication session checks need server configuration.')
  const session=await active.json() as {active?:boolean;invited?:boolean;requiresPasswordChange?:boolean;resetNonce?:string;passwordChangedAt?:string|null;createdAt?:number}
  if(session.active!==true||session.invited!==true||typeof session.requiresPasswordChange!=='boolean'||typeof session.createdAt!=='number'||!Number.isFinite(session.createdAt))return null
  if(session.requiresPasswordChange&&(typeof session.resetNonce!=='string'||!(session.passwordChangedAt===null||typeof session.passwordChangedAt==='string')))return null
  const methods=Array.isArray(claims.amr)?claims.amr as {method?:string;timestamp?:number}[]:[]
  const hasTotp=user.factors?.some(f=>f.factor_type==='totp'&&f.status==='verified')??false
  const mfaAt=claims.aal==='aal2'&&hasTotp?Math.max(0,...methods.filter(m=>m&&['totp','mfa/totp'].includes(m.method??'')&&typeof m.timestamp==='number'&&Number.isFinite(m.timestamp)).map(m=>m.timestamp!*1000)):0
  return {id:user.id,sessionId:claims.session_id,sessionCreatedAt:session.createdAt,hasTotp,mfaAt:mfaAt||undefined,passwordChangeRequired:session.requiresPasswordChange,...session.requiresPasswordChange?{passwordChange:{nonce:session.resetNonce!,changedAt:session.passwordChangedAt!}}:{}}
 }
}
export function principalAllowed(store:Store,p:Principal,now=Date.now()){const last=store.data.authLastSeen?.[p.sessionId]??p.sessionCreatedAt;return store.data.authDeletedUsers?.[p.id]===undefined&&store.data.authRevokedSessions?.[p.sessionId]===undefined&&(store.data.authRevokedBefore?.[p.id]===undefined||p.sessionCreatedAt>store.data.authRevokedBefore[p.id])&&now-p.sessionCreatedAt<30*86400000&&now-last<14*86400000}
export function freshMfa(store:Store,p:Principal|undefined,now:number){return !!p?.hasTotp&&!!p.mfaAt&&p.mfaAt<=now+5000&&now-p.mfaAt<MFA_WINDOW&&p.mfaAt>(store.data.authLocks?.[p.sessionId]??0)}
export function ownerFor(store:Store,p:Principal,now:number,create=false){const existing=store.data.authOwners?.[p.id]?.owner;if(existing&&store.data.accounts[existing])return existing;if(!create)return undefined;return store.update(d=>{const owner=randomToken(12);(d.authOwners??={})[p.id]={owner,linkedAt:now};d.accounts[owner]={kind:'connected',identitySource:'supabase_email',createdAt:now,lastLoginAt:now};return owner})}
export function linkOwner(store:Store,p:Principal,key:string,now:number){
 if(!freshMfa(store,p,now))throw new ActionError(403,'Recent TOTP verification is required.')
 const hash=sha256(key.trim()),record=store.data.accountRecovery?.[hash]
 if(!/^tatada-recovery_[\w-]{43}$/.test(key.trim())||!record||!store.data.accounts[record.owner]||store.data.accounts[record.owner].kind==='owner')throw new ActionError(401,'Recovery key invalid or already used.')
 if(Object.entries(store.data.authOwners??{}).some(([id,v])=>id!==p.id&&v.owner===record.owner))throw new ActionError(409,'This workspace is already linked to another verified identity.')
 const previous=store.data.authOwners?.[p.id]?.owner
 // Never merge two populated accounts or silently abandon new work.
 if(previous&&previous!==record.owner&&(populatedWorkspace(store.data.workspaces[previous]?.state)||store.data.printers?.[previous]||store.data.tokens[previous]||store.data.gmailTokens?.[previous]||store.data.calendarTokens?.[previous]||store.data.calendarLinks?.[previous]||store.data.calendarWrites?.[previous]||[store.data.gmailPending,store.data.gmailExchanges,store.data.calendarPending,store.data.calendarExchanges,store.data.foLoginTickets].some(table=>Object.values(table??{}).some(v=>v.owner===previous))||Object.values(store.data.pendingAuth).some(v=>v.accountId===previous)||Object.values(store.data.printJobs??{}).some(v=>(v as {ownerId?:string}).ownerId===previous)||Object.values(store.data.shares??{}).some(v=>v.owner===previous)||Object.values(store.data.actions).some(a=>a.ownerId===previous)||Object.values(store.data.foChats??{}).some(v=>(v as {ownerId?:string}).ownerId===previous)))throw new ActionError(409,'Your current workspace contains data. Export it and resolve the conflict before linking; nothing was changed.')
 store.update(d=>{(d.authOwners??={})[p.id]={owner:record.owner,linkedAt:now};delete d.accountRecovery![hash];(d.authLinkHistory??=[]).push({subject:p.id,from:previous,to:record.owner,at:now})})
 return record.owner
}
export const hiddenProfile={name:'',homeAirport:'',style:[],diet:[],memberships:[]}
export function workspaceView(state:unknown,unlocked:boolean){if(unlocked||!state||typeof state!=='object')return state;return {...state,profile:hiddenProfile}}
export function profileChanged(before:unknown,after:unknown){return canonical((before as {profile?:unknown}|undefined)?.profile??hiddenProfile)!==canonical((after as {profile?:unknown}|undefined)?.profile??hiddenProfile)}
export function hasPaymentData(value:unknown):boolean{if(!value||typeof value!=='object')return false;return Object.entries(value).some(([key,v])=>/^(card_?number|cvv|cvc|pin|payment_?methods?|credit_?card|pan|stripe_?token)$/i.test(key)||hasPaymentData(v))}

function populatedWorkspace(state:unknown){if(!state||typeof state!=='object')return false;const s=state as Record<string,unknown>;return s.onboarded===true||Object.entries(s).some(([k,v])=>k!=='profile'&&v&&typeof v==='object'&&Object.keys(v).length>0)||profileChanged(undefined,s)}

/** Deletion consent was persisted before cleanup; retries target the same identity only. */
export async function finishAuthDeletions(store:Store,identity:IdentityGateway,now=Date.now()){
 if(!identity.deleteUser)return
 for(const [id,job]of Object.entries(store.data.authDeletions??{}).filter(([,j])=>j.status!=='done'&&j.attempts<5&&(j.nextAt??0)<=now).slice(0,1)){
  store.update(()=>{job.attempts++;job.nextAt=now+60000});await store.flush()
  try{await identity.deleteUser(id);store.update(()=>{job.status='done'})}catch{store.update(()=>{job.status='pending'})}
 }
}
