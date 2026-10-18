import { createServer } from 'node:http'
import { nodeEventsMiddleware } from './node.ts'

/*
 * Standalone events service, separate from the paused Fo/sign-in server.
 *   EVENTS_PORT=8790  EVENTS_ALLOWED_ORIGINS=https://jayasrisng.com
 * Needs no API keys. Serves GET /events-api/search and /events-api/health.
 */
const port = Number(process.env.EVENTS_PORT ?? 8790)
const allowedOrigins = (process.env.EVENTS_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const handle = nodeEventsMiddleware({ allowedOrigins })
createServer((req, res) => void handle(req, res)).listen(port, process.env.EVENTS_HOST ?? '127.0.0.1', () => console.log(`Tatada events service on http://127.0.0.1:${port}/events-api/search`))
