import type { IncomingMessage, ServerResponse } from 'node:http'
import { createEventsHandler, type EventsHandlerOptions } from './handler.ts'

/** Node/Connect adapter for the events handler (used by `npm run events` and the Vite dev/preview servers). */
export function nodeEventsMiddleware(options: EventsHandlerOptions = {}) {
  const handle = createEventsHandler(options)
  return async (req: IncomingMessage, res: ServerResponse) => {
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
    const response = await handle(new Request(new URL(req.url ?? '/', 'http://localhost'), { method: req.method, headers }), req.socket.remoteAddress ?? 'unknown')
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(Buffer.from(await response.arrayBuffer()))
  }
}
