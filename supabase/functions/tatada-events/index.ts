import { createEventsHandler } from '../../../server/events/handler.ts'

// Key-free public event search, separate from the paused tatada-api (Fo/sign-in) function.
// Not deployed yet. Holds no secrets; reads only public listing pages.
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request, info: { remoteAddr: { hostname: string } }) => Promise<Response>): void }
const handle = createEventsHandler({ allowedOrigins: (Deno.env.get('EVENTS_ALLOWED_ORIGINS') ?? 'https://jayasrisng.com').split(',').map((s) => s.trim()).filter(Boolean) })
Deno.serve((req, info) => handle(req, req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || info.remoteAddr.hostname))
