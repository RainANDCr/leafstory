/**
 * 日期与时间工具。
 *
 * 时间语义约定（全项目遵守）：
 * - 时刻（创建时间、解锁时间等）：一律存 UTC 时间戳，展示时按用户时区转换；
 * - 日历日（纪念日、日记发生日期等）：使用本地时区的 yyyy-mm-dd 字符串
 *   （数据库对应 DATE 语义），避免 UTC 换算导致的跨天误差。
 */

/** 取某个时刻所在本地时区的日历日，返回 yyyy-mm-dd */
export function toISODate(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 解析 yyyy-mm-dd 为本地时区当日 00:00 的 Date（不用 new Date(iso) 避免 UTC 偏移问题） */
export function parseISODate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) throw new Error(`无效的日期字符串: ${iso}`)
  const [, y, m, d] = match
  return new Date(Number(y), Number(m) - 1, Number(d))
}

/** 两个日历日之间的整天数：to − from；用于「已经过多少天 / 还有多少天」 */
export function daysBetween(from: string, to: string): number {
  const a = parseISODate(from)
  const b = parseISODate(to)
  const ms = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
    Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  return Math.round(ms / 86_400_000)
}

/** yyyy-mm-dd → 「2026年10月24日」 */
export function formatDateHuman(iso: string): string {
  const d = parseISODate(iso)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

/** yyyy-mm-dd → 「10月24日」（同年场景的短显示） */
export function formatDateShort(iso: string): string {
  const d = parseISODate(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/** yyyy-mm-dd → 「2026年10月」（日记时间轴的月份分组） */
export function formatMonthLabel(iso: string): string {
  const d = parseISODate(iso)
  return `${d.getFullYear()}年${d.getMonth() + 1}月`
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/**
 * 纪念日的下一次发生日（本地日历日）：
 * - 每年重复：返回今天或之后最近的一次（2/29 在平年按 2/28 处理）；
 * - 一次性：返回其本身（可能已在过去）。
 */
export function nextOccurrence(dateISO: string, repeatsYearly: boolean, today: Date = new Date()): string {
  const d = parseISODate(dateISO)
  if (!repeatsYearly) return dateISO

  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const day = d.getDate()
  const month = d.getMonth()

  const at = (year: number): Date => {
    // 2/29 在平年收敛到 2/28，避免 Date 自动跳到 3 月
    if (month === 1 && day === 29 && !isLeapYear(year)) return new Date(year, 1, 28)
    return new Date(year, month, day)
  }

  let occ = at(todayStart.getFullYear())
  if (occ < todayStart) occ = at(todayStart.getFullYear() + 1)
  return toISODate(occ)
}

export type AnniversaryStatus = 'upcoming' | 'today' | 'passed'

export interface AnniversaryCountdown {
  status: AnniversaryStatus
  /** 距离下一次发生日（或对一次性过去事件：自那天以来）的天数 */
  days: number
  /** 下一次发生日（一次性事件为原日期） */
  nextISO: string
}

/** 纪念日倒计时/已过天数：按用户本地日历日计算，无 UTC 跨天误差 */
export function anniversaryCountdown(
  dateISO: string,
  repeatsYearly: boolean,
  today: Date = new Date(),
): AnniversaryCountdown {
  const nextISO = nextOccurrence(dateISO, repeatsYearly, today)
  const diff = daysBetween(toISODate(today), nextISO)
  if (diff === 0) return { status: 'today', days: 0, nextISO }
  if (diff > 0) return { status: 'upcoming', days: diff, nextISO }
  return { status: 'passed', days: -diff, nextISO }
}
