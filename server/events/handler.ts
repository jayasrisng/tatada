/*
 * HTTP surface of the events service: GET <base>/search?lat&lon&q&when&free&city&region&country&cc
 * Web-standard Request/Response, so the same handler runs in the Vite dev
 * server, the standalone Node server and an edge function. It holds no
 * credentials and is unrelated to the paused Fo sign-in/action API.
 */
import { parseQuery, searchEvents } from './search.ts'
import type { Fetcher } from './fetch.ts'

export interface EventsHandlerOptions {
  /** Exact origins allowed to call from a browser on another host. Same-origin needs none. */
  allowedOrigins?: string[]
  fetcher?: Fetcher
  now?: () => Date
  /** Requests per client per minute. */
  perMinute?: number
}

export function createEventsHandler(o: EventsHandlerOptions = {}) {
  const recent = new Map<string, number[]>()
  const perMinute = o.perMinute ?? 30
  return async (request: Request, clientKey = 'local'): Promise<Response> => {
    const origin = request.headers.get('origin')
    const cors: Record<string, string> = origin && o.allowedOrigins?.includes(origin) ? { 'access-control-allow-origin': origin, vary: 'origin' } : {}
    const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...cors, ...extra } })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET', 'access-control-max-age': '600' } })
    if (request.method !== 'GET') return json(405, { error: 'Method not allowed.' })
    const url = new URL(request.url)
    if (url.pathname.endsWith('/health')) return json(200, { ok: true })
    if (!url.pathname.endsWith('/search')) return json(404, { error: 'Not found.' })
    const now = Date.now(), hits = (recent.get(clientKey) ?? []).filter((t) => now - t < 60_000)
    if (hits.length >= perMinute) return json(429, { error: 'Too many searches. Try again in a minute.' }, { 'retry-after': '60' })
    recent.set(clientKey, [...hits, now])
    if (recent.size > 1000) recent.delete(recent.keys().next().value!)
    const query = parseQuery(url.searchParams)
    if (typeof query === 'string') return json(400, { error: query })
    try { return json(200, await searchEvents(query, o.fetcher, o.now?.())) }
    catch { return json(500, { error: 'Event search failed. Try again shortly.' }) }
  }
}
