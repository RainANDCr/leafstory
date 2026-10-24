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
