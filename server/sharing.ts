import type { Store } from './store.ts'
import type { Trip } from '../src/types.ts'
import { shareTrip, parseSharedTrip, type SharedTrip } from '../src/sharing/trip.ts'
import { validateWorkspace } from '../shared/workspace.ts'
import { randomToken, sha256 } from './crypto.ts'
import { ActionError } from './actions.ts'
export interface ShareLink { id: string; owner: string; tripId: string; tokenHash: string; snapshot: SharedTrip; createdAt: number; expiresAt: number; revokedAt?: number }
export class ShareService {
  private store: Store
  private now: () => number
  constructor(store: Store, now = Date.now) {this.store=store;this.now=now}
  create(owner: string, tripId: string, reviewed: unknown, includeNotes = false) {
    const state = this.store.data.workspaces[owner]?.state
    if (!validateWorkspace(state)) throw new ActionError(409, 'Sync a valid trip before sharing it.')
    const trip = (state as {trips:Trip[]}).trips.find(t=>t.id===tripId)
    if (!trip) throw new ActionError(404, 'Trip not found.')
    const snapshot = parseSharedTrip(JSON.stringify(shareTrip(trip, includeNotes)))
    let input:SharedTrip
    try{input=parseSharedTrip(JSON.stringify(reviewed))}catch{throw new ActionError(400,'Review a valid shared trip preview.')}
    // exportedAt is not content. Require the exact reviewed allowlisted snapshot from current saved data.
    if (JSON.stringify({...snapshot,exportedAt:''}) !== JSON.stringify({...input,exportedAt:''})) throw new ActionError(409, 'Trip changed. Review the current preview again.')
    const all = Object.values(this.store.data.shares ?? {})
    if (all.filter(s=>s.owner===owner&&!s.revokedAt&&s.expiresAt>this.now()).length>=50) throw new ActionError(409,'Revoke an old link before creating another.')
    const token = randomToken(32), id = randomToken(12), at = this.now()
    const link: ShareLink = { id, owner, tripId, snapshot, tokenHash: sha256(token), createdAt: at, expiresAt: at+30*86400000 }
    this.store.update(d=>{(d.shares??={})[id]=link})
    return {id,token,expiresAt:link.expiresAt}
  }
  list(owner:string, tripId?:string) { return Object.values(this.store.data.shares??{}).filter(s=>s.owner===owner&&(!tripId||s.tripId===tripId)).map(s=>({id:s.id,tripId:s.tripId,createdAt:s.createdAt,expiresAt:s.expiresAt,revokedAt:s.revokedAt})) }
  view(token:string) {
    const hash=sha256(token), link=Object.values(this.store.data.shares??{}).find(s=>s.tokenHash===hash)
    if(!link||link.revokedAt||link.expiresAt<=this.now()||!this.store.data.accounts[link.owner])throw new ActionError(404,'This trip link is unavailable or has been revoked.')
    return link.snapshot
  }
  revoke(owner:string,id:string) {
    const link=this.store.data.shares?.[id]
    if(!link||link.owner!==owner)throw new ActionError(404,'Link not found.')
    this.store.update(()=>{link.revokedAt=this.now()||1})
  }
}
