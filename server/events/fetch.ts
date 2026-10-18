/*
 * Bounded, cached upstream requests for public event pages.
 * - 8 s timeout and a 4 MB response cap per request
 * - fresh for 10 minutes; a copy up to 2 hours old is served if a refresh fails
 * - identical concurrent requests share one upstream call
 * - at most 20 upstream requests per host per minute
 */
/** `fetchedAt`: when the source last answered (ms). Older than now for cached copies. */
export interface FetchResult { body: string; stale: boolean; fetchedAt: number }
export type Fetcher = (url: string) => Promise<FetchResult>

export class UpstreamError extends Error {
  readonly status?: number
  constructor(message: string, status?: number) { super(message); this.status = status }
}

const FRESH_MS = 10 * 60_000, STALE_MS = 2 * 60 * 60_000, TIMEOUT_MS = 8_000, MAX_BYTES = 4_000_000, PER_HOST_PER_MINUTE = 20, MAX_ENTRIES = 200
const USER_AGENT = 'Mozilla/5.0 (compatible; TatadaEvents/0.1; user-requested public event lookup; +https://jayasrisng.com/tatada)'

export function createFetcher(fetchImpl: typeof fetch = fetch, now = () => Date.now()): Fetcher {
  const cache = new Map<string, { at: number; body: string }>()
  const inflight = new Map<string, Promise<FetchResult>>()
  const hits = new Map<string, number[]>()

  async function load(url: string): Promise<string> {
    const host = new URL(url).host
    const recent = (hits.get(host) ?? []).filter((t) => now() - t < 60_000)
    if (recent.length >= PER_HOST_PER_MINUTE) throw new UpstreamError('Too many requests to this source; try again in a minute.')
    hits.set(host, [...recent, now()])
    const r = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/json' }, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!r.ok) throw new UpstreamError(`Source answered ${r.status}.`, r.status)
    const declared = Number(r.headers.get('content-length') ?? 0)
    if (declared > MAX_BYTES) throw new UpstreamError('Source response was too large.')
    const reader = r.body?.getReader()
    if (!reader) return await r.text()
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BYTES) { await reader.cancel(); throw new UpstreamError('Source response was too large.') }
      chunks.push(value)
    }
    const all = new Uint8Array(size)
    let offset = 0
    for (const c of chunks) { all.set(c, offset); offset += c.byteLength }
    return new TextDecoder().decode(all)
  }

  return (url) => {
    const cached = cache.get(url)
    if (cached && now() - cached.at < FRESH_MS) return Promise.resolve({ body: cached.body, stale: false, fetchedAt: cached.at })
    const running = inflight.get(url)
    if (running) return running
    const task = load(url).then((body) => {
      const at = now()
      cache.set(url, { at, body })
      if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!)
      return { body, stale: false, fetchedAt: at }
    }, (error: unknown) => {
      if (cached && now() - cached.at < STALE_MS) return { body: cached.body, stale: true, fetchedAt: cached.at }
      throw error instanceof UpstreamError ? error : new UpstreamError((error as Error)?.name === 'TimeoutError' ? 'Source timed out.' : 'Source could not be reached.')
    }).finally(() => inflight.delete(url))
    inflight.set(url, task)
    return task
  }
}
