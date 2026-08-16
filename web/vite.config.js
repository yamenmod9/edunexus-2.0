import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The dev server proxies /api and /health to the Flask backend so local
// development runs same-origin. Deployed builds talk to VITE_API_URL directly
// and rely on the backend's CORS allowlist instead.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:5055', changeOrigin: true },
      '/health': { target: 'http://127.0.0.1:5055', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
  },
})
