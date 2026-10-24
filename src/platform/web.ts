/**
 * Web 平台适配器。
 *
 * 本地通知在 Web 端不承诺（无可靠的通知能力），全部为安全空实现，
 * 与「不虚假承诺」的项目原则一致。Android 适配器将在阶段 7 引入。
 */
import type { PlatformAdapter } from './types'

export const webPlatform: PlatformAdapter = {
  name: 'web',
  label: '网页版',
  notifications: {
    async isAvailable() {
      return false
    },
    async requestPermission() {
      return false
    },
    async schedule() {
      /* Web 端暂不支持本地通知，静默忽略 */
    },
    async cancel() {
      /* Web 端暂不支持本地通知，静默忽略 */
    },
  },
}
