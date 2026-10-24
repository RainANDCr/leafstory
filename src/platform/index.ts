/**
 * 平台适配层出口：Web 与 Android（Capacitor）自动切换。
 * 判定基于 Capacitor 注入的原生桥（仅原生环境存在）；
 * Web 端始终使用安全空实现（不支持本地通知，不虚假承诺）。
 */
import { webPlatform } from './web'
import { capacitorPlatform } from './capacitor'
import type { PlatformAdapter } from './types'

function detectPlatform(): PlatformAdapter {
  const bridge = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return bridge?.isNativePlatform?.() ? capacitorPlatform : webPlatform
}

export const platform: PlatformAdapter = detectPlatform()

export type { PlatformAdapter, PlatformName } from './types'
