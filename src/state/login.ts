/** One browser-bound secret per login attempt, shared only by this origin.
 * Per-attempt keys prevent overlapping tabs or repeated logins from replacing
 * another pending attempt. Secrets never appear in a URL or diagnostics.
 */
interface StorageLike {getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void;key(index:number):string|null;length:number}
const TTL=10*60_000
export function loginAttempts(base:string,session:()=>StorageLike,local:()=>StorageLike,now=Date.now){
 const prefix=`tatada:login-attempt:${base}:`,legacy=`tatada:login-binding:${base}`
 const stores=[session,local]
 const read=(id:string)=>{if(!/^[a-f0-9]{32}$/.test(id))return '';for(const get of stores)try{const raw=JSON.parse(get().getItem(prefix+id)??'null');if(raw&&typeof raw.secret==='string'&&/^[a-f0-9]{64}$/.test(raw.secret)&&raw.at+TTL>now())return raw.secret}catch{/* try the other browser store */}return ''}
 return {
  create(id:string,secret:string){
   if(!/^[a-f0-9]{32}$/.test(id)||!/^[a-f0-9]{64}$/.test(secret))throw Error('Invalid login attempt')
   let saved=false
   for(const get of stores)try{const storage=get();for(let i=storage.length-1;i>=0;i--){const key=storage.key(i);if(!key?.startsWith(prefix))continue;try{const record=JSON.parse(storage.getItem(key)??'null');if(!record||record.at+TTL<=now())storage.removeItem(key)}catch{storage.removeItem(key)}}storage.setItem(prefix+id,JSON.stringify({secret,at:now()}));saved=true}catch{/* a second store may work */}
   if(!saved)throw Error('Browser storage is unavailable. Enable site storage before signing in.')
  },
  binding(id?:string){if(id)return read(id);try{return session().getItem(legacy)??''}catch{return ''}},
  remove(id?:string){if(!id)return;for(const get of stores)try{get().removeItem(prefix+id)}catch{/* no credentials logged */}},
 }
}
const exchanges=new Map<string,Promise<unknown>>()
/** StrictMode/remounts share the in-flight redemption; the server remains one-use. */
export function redeemOnce<T>(code:string,redeem:()=>Promise<T>):Promise<T>{let pending=exchanges.get(code);if(!pending){if(exchanges.size>20)exchanges.delete(exchanges.keys().next().value!);pending=redeem();exchanges.set(code,pending)}return pending as Promise<T>}
