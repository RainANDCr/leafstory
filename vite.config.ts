/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // 测试一律按「本地模式」跑：清空开发者本机 .env 里的云端变量，
    // 保证测试结果与部署环境无关
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
      VITE_LEANCLOUD_APP_ID: '',
      VITE_LEANCLOUD_APP_KEY: '',
    },
    // e2e/ 属于 Playwright（npm run test:e2e），不进 Vitest
    exclude: ['node_modules', 'dist', 'android', 'e2e', 'playwright.config.ts', 'release', 'electron'],
  },
})
