import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const API_TARGET = process.env.API_TARGET ?? 'http://localhost:8787'
// The Symphony daemon (agent engine) — a separate local service. One config value.
const SYMPHONY_TARGET = process.env.SYMPHONY_TARGET ?? 'http://127.0.0.1:4517'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        // Critical for the SSE stream: do not buffer the proxied response.
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache, no-transform'
            }
          })
        },
      },
      // Per-task live agent log: proxy to the Symphony daemon, strip the prefix.
      '/symphony': {
        target: SYMPHONY_TARGET,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/symphony/, ''),
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache, no-transform'
            }
          })
        },
      },
    },
  },
})
