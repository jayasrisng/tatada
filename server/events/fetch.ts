/*
 * Bounded, cached upstream requests for public event pages.
 * - 8 s timeout and a 4 MB response cap per request
 * - fresh for 10 minutes; a copy up to 2 hours old is served if a refresh fails
 * - identical concurrent requests share one upstream call
 * - at most 20 upstream requests per host and 40 in total per minute (per instance)
 * - a source that answers 403/429/5xx is left alone for 5 minutes (longer if it asks)
 * - cached bodies are capped at 40 MB in total, well under a 256 MB edge worker
 */
/** `fetchedAt`: when the source last answered (ms). Older than now for cached copies. */
export interface FetchResult { body: string; stale: boolean; fetchedAt: number }
export type Fetcher = (url: string) => Promise<FetchResult>

export class UpstreamError extends Error {
  readonly status?: number
  constructor(message: string, status?: number) { super(message); this.status = status }
}

const FRESH_MS = 10 * 60_000, STALE_MS = 2 * 60 * 60_000, TIMEOUT_MS = 8_000, MAX_BYTES = 4_000_000, PER_HOST_PER_MINUTE = 20, TOTAL_PER_MINUTE = 40, MAX_ENTRIES = 200, MAX_CACHE_CHARS = 40_000_000, COOLDOWN_MS = 5 * 60_000
const USER_AGENT = 'Mozilla/5.0 (compatible; TatadaEvents/0.1; user-requested public event lookup; +https://jayasrisng.com/tatada)'

export function createFetcher(fetchImpl: typeof fetch = fetch, now = () => Date.now()): Fetcher {
  const cache = new Map<string, { at: number; body: string }>()
  const inflight = new Map<string, Promise<FetchResult>>()
  const hits = new Map<string, number[]>()
  const cooling = new Map<string, number>()
  let all: number[] = [], cacheChars = 0

  async function load(url: string): Promise<string> {
    const host = new URL(url).host
    if ((cooling.get(host) ?? 0) > now()) throw new UpstreamError('This source asked us to slow down; trying again in a few minutes.')
    const recent = (hits.get(host) ?? []).filter((t) => now() - t < 60_000)
    all = all.filter((t) => now() - t < 60_000)
    if (recent.length >= PER_HOST_PER_MINUTE || all.length >= TOTAL_PER_MINUTE) throw new UpstreamError('Too many requests to this source; try again in a minute.')
    hits.set(host, [...recent, now()]); all.push(now())
    const r = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/json' }, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!r.ok) {
      if (r.status === 403 || r.status === 429 || r.status >= 500) {
        const asked = Number(r.headers.get('retry-after')) * 1000
        cooling.set(host, now() + Math.min(15 * 60_000, Math.max(COOLDOWN_MS, Number.isFinite(asked) ? asked : 0)))
      }
      await r.body?.cancel().catch(() => {})
      throw new UpstreamError(`Source answered ${r.status}.`, r.status)
    }
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
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const c of chunks) { bytes.set(c, offset); offset += c.byteLength }
    return new TextDecoder().decode(bytes)
  }

  return (url) => {
    const cached = cache.get(url)
    if (cached && now() - cached.at < FRESH_MS) return Promise.resolve({ body: cached.body, stale: false, fetchedAt: cached.at })
    const running = inflight.get(url)
    if (running) return running
    const task = load(url).then((body) => {
      const at = now()
      cacheChars += body.length - (cache.get(url)?.body.length ?? 0)
      cache.delete(url)
      cache.set(url, { at, body })
      while (cache.size > MAX_ENTRIES || cacheChars > MAX_CACHE_CHARS) {
        const [oldest, entry] = cache.entries().next().value!
        cache.delete(oldest); cacheChars -= entry.body.length
      }
      return { body, stale: false, fetchedAt: at }
    }, (error: unknown) => {
      if (cached && now() - cached.at < STALE_MS) return { body: cached.body, stale: true, fetchedAt: cached.at }
      throw error instanceof UpstreamError ? error : new UpstreamError((error as Error)?.name === 'TimeoutError' ? 'Source timed out.' : 'Source could not be reached.')
    }).finally(() => inflight.delete(url))
    inflight.set(url, task)
    return task
  }
}
