/**
 * 纪念日展示逻辑：类型文案、金叶标记、下一次发生日排序。
 * 倒计时计算在 lib/dates（本地日历日语义，无 UTC 跨天误差）。
 */
import { anniversaryCountdown, type AnniversaryCountdown } from '@/lib/dates'
import { zhCN } from '@/i18n'
import type { Anniversary, AnniversaryKind } from '@/services/anniversaryService'

/** 相识 / 在一起 / 第一次约会 为金叶纪念日 */
export function isGoldKind(kind: AnniversaryKind): boolean {
  return kind === 'met' || kind === 'together' || kind === 'first_date'
}

export function kindLabel(kind: AnniversaryKind): string {
  return zhCN.anniversaries.kinds[kind]
}

export interface AnniversaryView extends Anniversary {
  countdown: AnniversaryCountdown
}

export function withCountdown(items: Anniversary[], today: Date = new Date()): AnniversaryView[] {
  return items.map((a) => ({ ...a, countdown: anniversaryCountdown(a.anniversaryDate, a.repeatsYearly, today) }))
}

/** 下一个纪念日：未到来的最近一个；没有未来事件时取最近过去的按年重复事件 */
export function nextAnniversary(items: AnniversaryView[]): AnniversaryView | null {
  const upcoming = items
    .filter((a) => a.countdown.status !== 'passed')
    .sort((a, b) => a.countdown.days - b.countdown.days)
  if (upcoming.length > 0) return upcoming[0]!

  const passedRecurring = items
    .filter((a) => a.countdown.status === 'passed' && a.repeatsYearly)
    .sort((a, b) => a.countdown.days - b.countdown.days)
  return passedRecurring[0] ?? null
}

/** 列表排序：即将到来的在前，其次按下一次发生日 */
export function sortForDisplay(items: AnniversaryView[]): AnniversaryView[] {
  return [...items].sort((a, b) => {
    const rank = (v: AnniversaryView) => (v.countdown.status === 'passed' ? 1 : 0)
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    return a.countdown.nextISO.localeCompare(b.countdown.nextISO)
  })
}

export function countdownText(view: AnniversaryView): string {
  const { status, days } = view.countdown
  if (status === 'today') return zhCN.common.today
  if (status === 'upcoming') return zhCN.anniversaries.daysUntil(days)
  return zhCN.anniversaries.daysPassed(days)
}
