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
const KEY_HEADERS = ['cf-connecting-ip', 'x-real-ip'] as const
const keySource = (req: Request) => KEY_HEADERS.find((h) => req.headers.get(h)) ?? (req.headers.get('x-forwarded-for') ? 'x-forwarded-for' : 'remote-addr')
const client = (req: Request, fallback: string) => req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ?? fallback
// Health reports which header keyed the caller (name only) and a per-instance id, to verify limits.
const instance = crypto.randomUUID().slice(0, 8)
Deno.serve((req, info) => new URL(req.url).pathname.endsWith('/health')
  ? Promise.resolve(Response.json({ ok: true, instance, key: keySource(req) }, { headers: { 'cache-control': 'no-store' } }))
  : handle(req, client(req, info.remoteAddr.hostname)))
