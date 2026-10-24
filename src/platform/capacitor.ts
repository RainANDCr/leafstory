/**
 * Android（Capacitor）平台适配器：本地纪念日提醒。
 * - 仅在 Capacitor 原生环境生效；Web 端依旧使用安全空实现；
 * - 权限需用户在设置里主动开启（运行时授权），逐次请求；
 * - 只在应用运行时调度本地通知；设备关机/应用被杀后不承诺送达，
 *   重新打开应用时会按最新纪念日重新调度。
 */
import { LocalNotifications } from '@capacitor/local-notifications'
import type { PlatformAdapter } from './types'

export const capacitorPlatform: PlatformAdapter = {
  name: 'android',
  label: 'Android 应用',
  notifications: {
    async isAvailable() {
      try {
        const { display } = await LocalNotifications.checkPermissions()
        return display === 'granted'
      } catch {
        return false
      }
    },
    async requestPermission() {
      try {
        const { display } = await LocalNotifications.requestPermissions()
        return display === 'granted'
      } catch {
        return false
      }
    },
    async schedule({ id, title, body, fireAt }) {
      await LocalNotifications.schedule({
        notifications: [
          {
            // 插件要求 int32 id；由 anniversary id 哈希得到（见 notifications.ts）
            id: Number(BigInt(id) & 0x7fffffffn) || Math.abs(hashString(id)),
            title,
            body,
            schedule: { at: fireAt },
          },
        ],
      })
    },
    async cancel(id) {
      await LocalNotifications.cancel({
        notifications: [{ id: Number(BigInt(id) & 0x7fffffffn) || Math.abs(hashString(id)) }],
      })
    },
  },
}

function hashString(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}
