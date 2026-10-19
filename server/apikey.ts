import type { FoCredentials } from './fo.ts'

/*
 * A Wajo API key (WAJO_FO_API_KEY) acts as the single Wajo account it belongs
 * to; it says nothing about who is using Tatada. So it is only ever used for
 * the one local owner of a localhost-only server, never for other accounts.
 */
export class ApiKeyCredentials implements FoCredentials {
  private key: string
  private ownerId: string
  constructor(key: string, ownerId: string) {
    if (!/^\S{20,200}$/.test(key)) throw new Error('WAJO_FO_API_KEY looks malformed')
    this.key = key
    this.ownerId = ownerId
  }
  connected(userId: string) { return userId === this.ownerId }
  async accessToken(userId: string) {
    if (userId !== this.ownerId) throw Object.assign(new Error('Fo is not connected for this account'), { code: 'not_connected' })
    return this.key
  }
}
