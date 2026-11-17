/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// The API has no CORS config, so in development every /api call goes through this proxy
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target: env.KHRONOS_API_URL || 'http://localhost:8080', changeOrigin: true },
      },
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      restoreMocks: true,
      // Tests leave CSS out, except the stylesheet, which a test checks for what would widen a phone's page
      css: { include: [/app\.css/] },
    },
  }
})
