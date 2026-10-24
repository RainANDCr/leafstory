/**
 * 纪念日本地提醒：把「未来 N 天内」的纪念日映射为本地通知目标。
 * 纯函数部分可单测；调度经 platform.notifications（Android 真实通知，
 * Web 空实现）。通知在当天上午 9 点（本地时区）触发；不承诺应用
 * 未运行时的新增纪念日自动提醒（下次打开应用会重新调度）。
 */
import { nextOccurrence } from '@/lib/dates'
import type { Anniversary } from '@/services/anniversaryService'

export interface NotificationTarget {
  /** 稳定 id：anniversary id（平台层再哈希为 int32） */
  id: string
  title: string
  body: string
  fireAt: Date
}

export const NOTIFY_LOOKAHEAD_DAYS = 30
const NOTIFY_HOUR = 9

/** 计算未来 N 天内的提醒目标（已过触发时刻的当天提醒顺延到次日早 9 点不再发） */
export function pickNotificationTargets(anniversaries: readonly Anniversary[], now = new Date()): NotificationTarget[] {
  const targets: NotificationTarget[] = []
  for (const a of anniversaries) {
    const next = nextOccurrence(a.anniversaryDate, a.repeatsYearly, now)
    const fireAt = new Date(next)
    fireAt.setHours(NOTIFY_HOUR, 0, 0, 0)
    if (fireAt.getTime() <= now.getTime()) continue
    const daysAway = Math.round((fireAt.getTime() - now.getTime()) / 86_400_000)
    if (daysAway > NOTIFY_LOOKAHEAD_DAYS) continue
    targets.push({
      id: a.id,
      title: `🍂 ${a.title}`,
      body: daysAway === 0 ? '就是今天' : `还有 ${daysAway} 天`,
      fireAt,
    })
  }
  return targets.sort((x, y) => x.fireAt.getTime() - y.fireAt.getTime())
}

/** 用户偏好（localStorage 持久化；默认关闭，需显式开启并授权） */
const PREF_KEY = 'leafstory:anniversary-notifications'

export function isNotificationPrefOn(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === '1'
  } catch {
    return false
  }
}

export async function enableNotifications(anniversaries: readonly Anniversary[]): Promise<boolean> {
  const { platform } = await import('@/platform')
  const granted = await platform.notifications.requestPermission()
  if (!granted) return false
  try {
    localStorage.setItem(PREF_KEY, '1')
  } catch {
    /* 隐私模式下偏好不持久化，仅本次会话生效 */
  }
  await rescheduleNotifications(anniversaries)
  return true
}

export async function disableNotifications(anniversaries: readonly Anniversary[]): Promise<void> {
  try {
    localStorage.removeItem(PREF_KEY)
  } catch {
    /* 同上 */
  }
  const { platform } = await import('@/platform')
  for (const a of anniversaries) {
    await platform.notifications.cancel(a.id).catch(() => undefined)
  }
}

/** 按最新纪念日列表重建提醒（幂等：同 id 重复调度即覆盖） */
export async function rescheduleNotifications(anniversaries: readonly Anniversary[]): Promise<void> {
  if (!isNotificationPrefOn()) return
  const { platform } = await import('@/platform')
  if (!(await platform.notifications.isAvailable())) return
  for (const target of pickNotificationTargets(anniversaries)) {
    await platform.notifications.schedule(target).catch(() => undefined)
  }
}
