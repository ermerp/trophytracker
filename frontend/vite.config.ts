import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Im lokalen Betrieb laeuft der Worker getrennt unter :8787.
    // Produktiv gibt es diesen Proxy nicht: dort liefert derselbe Worker
    // sowohl die Assets als auch /api/*, es ist also dieselbe Origin.
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
