import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor 配置：把同一套 React 构建产物（dist/）包装为 Android 应用。
 * - webDir 指向 Vite 构建输出；
 * - Android 与 Web 共用同一份数据（云端模式 = 同一个 Supabase；
 *   本地模式 = 各自设备本地）；
 * - 不打包任何 service_role / BYOK Key（Key 仅会话内存，见 features/ai）。
 */
const config: CapacitorConfig = {
  appId: 'app.leafstory.diary',
  appName: '落叶物语',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: 'https',
  },
}

export default config
