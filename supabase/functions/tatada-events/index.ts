import { createEventsHandler } from '../../../server/events/handler.ts'

// Key-free public event search, separate from the paused tatada-api (Fo/sign-in) function.
// Not deployed yet. Holds no secrets; reads only public listing pages.
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request, info: { remoteAddr: { hostname: string } }) => Promise<Response>): void }
const handle = createEventsHandler({
  allowedOrigins: (Deno.env.get('EVENTS_ALLOWED_ORIGINS') ?? 'https://jayasrisng.com').split(',').map((s) => s.trim()).filter(Boolean),
  requireOrigin: true,
  perMinute: 20,
  instancePerMinute: 120,
})
// cf-connecting-ip is set by Supabase's Cloudflare edge and can't be supplied by the
// caller; x-forwarded-for's first entry can, so it is only a last resort.
const client = (req: Request, fallback: string) => req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ?? fallback
Deno.serve((req, info) => handle(req, client(req, info.remoteAddr.hostname)))
