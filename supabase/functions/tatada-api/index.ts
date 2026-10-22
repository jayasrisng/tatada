import {SupabaseIdentity} from '../../../server/account-auth.ts'
import { createEdgeHandler } from '../../../server/edge.ts'
import { SupabaseRepository } from '../../../server/supabase.ts'

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Promise<Response>): void }
declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void }
const url = Deno.env.get('SUPABASE_URL')!
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
if (!url || !key) throw new Error('Supabase runtime credentials are missing')
Deno.serve(createEdgeHandler({
  repository: new SupabaseRepository(url, key),
  wajoPrinting:Deno.env.get('TATADA_PRINT_DELIVERY')==='wajo',
  identity:Deno.env.get('TATADA_AUTH_MODE')==='wajo'?undefined:new SupabaseIdentity({url,publicKey:Deno.env.get('SUPABASE_ANON_KEY')??'',serviceKey:key}),
  appUrl: Deno.env.get('TATADA_APP_URL') ?? 'https://jayasrisng.com/tatada',
  publicUrl: `${url}/functions/v1/tatada-api`,
  secret: Deno.env.get('TATADA_SECRET') ?? key,
  resource: Deno.env.get('FO_RESOURCE'),
  liveRecipients: (Deno.env.get('TATADA_LIVE_RECIPIENTS') ?? '').split(',').filter(Boolean),
  mode: 'live',
  research: Deno.env.get('CLAUDE_API_KEY')||Deno.env.get('ANTHROPIC_API_KEY') ? {key:(Deno.env.get('CLAUDE_API_KEY')||Deno.env.get('ANTHROPIC_API_KEY'))!,model:Deno.env.get('CLAUDE_MODEL')} : undefined,
  gmail: Deno.env.get('GOOGLE_CLIENT_ID')&&Deno.env.get('GOOGLE_CLIENT_SECRET') ? {clientId:Deno.env.get('GOOGLE_CLIENT_ID')!,clientSecret:Deno.env.get('GOOGLE_CLIENT_SECRET')!,redirectUri:Deno.env.get('GOOGLE_REDIRECT_URI')} : undefined,
  travel: Deno.env.get('AMADEUS_CLIENT_ID')&&Deno.env.get('AMADEUS_CLIENT_SECRET') ? {clientId:Deno.env.get('AMADEUS_CLIENT_ID')!,clientSecret:Deno.env.get('AMADEUS_CLIENT_SECRET')!,environment:Deno.env.get('AMADEUS_ENV')==='production'?'production':'test'} : undefined,
  waitUntil: (task) => EdgeRuntime.waitUntil(task),
}))
