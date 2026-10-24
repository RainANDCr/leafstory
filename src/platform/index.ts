/**
 * 平台适配层出口。
 *
 * 当前只有 Web 实现；阶段 7 加入 Capacitor 时：
 *   import { capacitorPlatform } from './capacitor'
 *   export const platform = capacitorPlatform ?? webPlatform
 */
import { webPlatform } from './web'
import type { PlatformAdapter } from './types'

export const platform: PlatformAdapter = webPlatform

export type { PlatformAdapter, PlatformName } from './types'
