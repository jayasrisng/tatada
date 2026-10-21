import type { FoCredentials } from './fo.ts'

/*
 * A Wajo API key (WAJO_FO_API_KEY) acts as the single Wajo account it belongs
 * to; it says nothing about who is using Tatada. So it is only ever used for
 * the one local owner of a localhost-only server, never for other accounts.
 */
export class ApiKeyCredentials implements FoCredentials {
  private key: string
  private ownerId: string
  private enabled:()=>boolean
  constructor(key: string, ownerId: string, enabled:()=>boolean=()=>true) {
    if (!/^\S{20,200}$/.test(key)) throw new Error('WAJO_FO_API_KEY looks malformed')
    this.enabled=enabled
    this.key = key
    this.ownerId = ownerId
  }
  connected(userId: string) { return userId === this.ownerId && this.enabled() }
  async accessToken(userId: string) {
    if (!this.connected(userId)) throw Object.assign(new Error('Fo is not connected for this account'), { code: 'not_connected' })
    return this.key
  }
}

/** An explicitly authorized OAuth connection takes priority; auth errors never switch accounts. */
export class PreferredFoCredentials implements FoCredentials {
  private primary:FoCredentials
  private fallback:FoCredentials
  private selected=new Set<string>()
  constructor(primary:FoCredentials,fallback:FoCredentials){this.primary=primary;this.fallback=fallback}
  private usePrimary(userId:string){if(this.primary.connected(userId))this.selected.add(userId);return this.selected.has(userId)}
  connected(userId:string){return this.usePrimary(userId)?this.primary.connected(userId):this.fallback.connected(userId)}
  accessToken(userId:string,forceRefresh=false){return this.usePrimary(userId)?this.primary.accessToken(userId,forceRefresh):this.fallback.accessToken(userId,forceRefresh)}
}
