import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** Adapt the existing, tested HTTP API to a Fetch handler without opening a socket. */
export async function webRequest(request: Request, path: string, handle: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>): Promise<Response> {
  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.byteLength > 1024 * 1024 + 1024) return Response.json({ error: 'Request too large' }, { status: 413 })
  const req = Readable.from(bytes.length ? [Buffer.from(bytes)] : []) as unknown as IncomingMessage
  Object.assign(req, { url: path, method: request.method, headers: Object.fromEntries(request.headers), socket: { remoteAddress: request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'edge' } })
  return new Promise<Response>((resolve, reject) => {
    const headers = new Headers()
    let status = 200
    let ended = false
    const setHeader = (name: string, value: string | string[]) => {
      headers.delete(name)
      for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item)
    }
    const res = {
      setHeader,
      writeHead(code: number, values?: Record<string, string | string[]>) {
        status = code
        for (const [key, value] of Object.entries(values ?? {})) setHeader(key, value)
      },
      end(body?: string) {
        if (ended) return
        ended = true
        resolve(new Response(status === 204 ? null : body ?? null, { status, headers }))
      },
    } as unknown as ServerResponse
    void handle(req, res).catch(reject)
  })
}
