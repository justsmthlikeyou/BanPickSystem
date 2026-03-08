import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.error('[proxy error]', err, 'req:', req.url)
          })
        }
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
        headers: { Connection: 'keep-alive' },
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.error('[ws proxy error]', err, 'req:', req.url)
          })
        }
      },
    },
  },
})
