import type { Plugin } from 'vite'
import { createHash } from 'node:crypto'
/** Build-scoped static allowlist. No runtime response caching, credentials, API calls, or document storage. */
export function offlineShell(): Plugin {
  let base = '/'
  return { name: 'tatada-offline-shell', apply: 'build', configResolved(c) { base = c.base }, generateBundle(_, bundle) {
    const files = Object.keys(bundle).filter(f => /\.(?:js|mjs|css|woff2?)$/.test(f))
    const revision = createHash('sha256').update(files.sort().join('\n')).digest('hex').slice(0, 16)
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const CACHE='tatada-shell-${revision}';
const ROOT=${JSON.stringify(base)};
const FILES=${JSON.stringify([base, ...files.map(f => base + f)])};
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(FILES);await self.skipWaiting()})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('tatada-shell-')&&name!==CACHE)await caches.delete(name);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
if(event.request.mode==='navigate'&&url.pathname===ROOT){event.respondWith(fetch(event.request).catch(()=>caches.open(CACHE).then(c=>c.match(ROOT))));return}
if(FILES.includes(url.pathname)&&!url.search)event.respondWith(caches.open(CACHE).then(async c=>(await c.match(url.pathname))||fetch(event.request)));
});` })
  } }
}
