import { offlineShell } from './scripts/offline-plugin'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { nodeEventsMiddleware } from './server/events/node.ts'

// Public event listings are read server-side (providers send no CORS headers).
// The dev and preview servers mount the key-free events service at /events-api.
function eventsService(): Plugin {
  const mount = (server: { middlewares: { use(path: string, fn: (req: any, res: any) => void): void } }) => {
    const handle = nodeEventsMiddleware()
    server.middlewares.use('/events-api', (req, res) => { req.url = `/events-api${req.url}`; void handle(req, res) })
  }
  return { name: 'tatada-events', configureServer: mount, configurePreviewServer: mount }
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react(), eventsService(), offlineShell()],
  worker: { format: 'es' },
  server: {
    port: 5173,
    // The Tatada server (npm run server). Same-origin for cookies and CSRF.
    proxy: { '/api': { target: `http://127.0.0.1:${process.env.TATADA_BACKEND_PORT ?? '8787'}`, changeOrigin: false } },
  },
})
