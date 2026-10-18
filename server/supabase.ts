import type { Data } from './store.ts'

/** Private service-role transport; no database credentials enter the browser. */
export class SupabaseRepository {
  constructor(privateUrl: string, privateKey: string) {
    this.url = privateUrl.replace(/\/$/, '')
    this.key = privateKey
  }
  private url: string
  private key: string
  private async request(path: string, body?: unknown): Promise<any> {
    const response = await fetch(`${this.url}/rest/v1/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { apikey: this.key, authorization: `Bearer ${this.key}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error(`Database request failed (${response.status})`)
    return response.json()
  }
  async read(): Promise<Partial<Data>> {
    return (await this.request('tatada_runtime?id=eq.1&select=state'))[0]?.state ?? {}
  }
  async acquire(token: string): Promise<{ busy?: boolean; state?: Partial<Data>; recovered?: boolean }> {
    return this.request('rpc/tatada_acquire', { p_token: token })
  }
  async save(token: string, state: Data) {
    if (!(await this.request('rpc/tatada_save', { p_token: token, p_state: state }))) throw new Error('Database lease expired; execution stopped')
  }
  async release(token: string) {
    await this.request('rpc/tatada_release', { p_token: token })
  }
}
