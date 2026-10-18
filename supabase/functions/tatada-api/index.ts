import { createEdgeHandler } from '../../../server/edge.ts'
import { SupabaseRepository } from '../../../server/supabase.ts'

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Promise<Response>): void }
declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void }
const url = Deno.env.get('SUPABASE_URL')!
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
if (!url || !key) throw new Error('Supabase runtime credentials are missing')
Deno.serve(createEdgeHandler({
  repository: new SupabaseRepository(url, key),
  appUrl: Deno.env.get('TATADA_APP_URL') ?? 'https://jayasrisng.com/tatada',
  publicUrl: `${url}/functions/v1/tatada-api`,
  secret: Deno.env.get('TATADA_SECRET') ?? key,
  resource: Deno.env.get('FO_RESOURCE'),
  liveRecipients: (Deno.env.get('TATADA_LIVE_RECIPIENTS') ?? '').split(',').filter(Boolean),
  mode: 'live',
  waitUntil: (task) => EdgeRuntime.waitUntil(task),
}))
