import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The Tatada server (npm run server). Same-origin for cookies and CSRF.
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } },
  },
})
