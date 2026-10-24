import { defineConfig } from '@playwright/test'

// E2E：本地模式关键路径（无需任何外部服务）
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5199',
    locale: 'zh-CN',
    viewport: { width: 390, height: 844 }, // 常见 Android 宽度
  },
  webServer: {
    command: 'npm run dev -- --port 5199 --strictPort',
    url: 'http://127.0.0.1:5199',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  reporter: [['list']],
})
