/** Retry only reads and session status, and only explicit temporary rejection.
 * Never replay a mutation after a timeout or uncertain provider result.
 */
export async function fetchWithBackoff(url: string, init: RequestInit, path: string, fetcher: typeof fetch = fetch): Promise<Response> {
 const method = (init.method ?? 'GET').toUpperCase()
 const retryable = method === 'GET' || (method === 'POST' && path === '/api/session')
 for (let attempt = 0; ; attempt++) {
  const response = await fetcher(url, init)
  if (!retryable || ![429,503].includes(response.status) || attempt >= 2 || init.signal?.aborted) return response
  const seconds = Number(response.headers.get('retry-after'))
  const delay = Math.min(2000, Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 250 * 2 ** attempt)
  await response.body?.cancel()
  await new Promise<void>((resolve, reject) => {
   const aborted = () => {clearTimeout(timer);reject(init.signal?.reason ?? new DOMException('Aborted','AbortError'))}
   const timer = setTimeout(() => {init.signal?.removeEventListener('abort',aborted);resolve()},delay)
   init.signal?.addEventListener('abort',aborted,{once:true})
   if(init.signal?.aborted)aborted()
  })
 }
}
