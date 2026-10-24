/**
 * 故事书纯逻辑：把可见日记聚合为「月与年」虚拟章节。
 * 月度/年度不落库——日记一改，章节自动同步。
 */
import type { DiaryEntry } from '@/features/diary/types'

export interface MonthChapter {
  /** 'YYYY-MM' */
  key: string
  year: number
  month: number
  entries: DiaryEntry[] // 发生日升序（阅读顺序）
  firstDate: string
  lastDate: string
}

export interface YearGroup {
  year: number
  chapters: MonthChapter[] // 月份倒序（最近在前）
  total: number
}

/** 按年/月聚合（输入通常为发生日期倒序的可见日记） */
export function groupByMonth(entries: readonly DiaryEntry[]): YearGroup[] {
  const byMonth = new Map<string, DiaryEntry[]>()
  for (const e of entries) {
    const key = e.happenedOn.slice(0, 7) // YYYY-MM
    const list = byMonth.get(key)
    if (list) list.push(e)
    else byMonth.set(key, [e])
  }

  const byYear = new Map<number, MonthChapter[]>()
  for (const [key, list] of byMonth) {
    const year = Number(key.slice(0, 4))
    const month = Number(key.slice(5, 7))
    const sorted = [...list].sort(
      (a, b) => a.happenedOn.localeCompare(b.happenedOn) || a.createdAt.localeCompare(b.createdAt),
    )
    const chapter: MonthChapter = {
      key,
      year,
      month,
      entries: sorted,
      firstDate: sorted[0]!.happenedOn,
      lastDate: sorted[sorted.length - 1]!.happenedOn,
    }
    const chapters = byYear.get(year)
    if (chapters) chapters.push(chapter)
    else byYear.set(year, [chapter])
  }

  return Array.from(byYear.entries())
    .sort((a, b) => b[0] - a[0]) // 年份倒序
    .map(([year, chapters]) => ({
      year,
      chapters: chapters.sort((a, b) => b.month - a.month), // 月份倒序
      total: chapters.reduce((sum, c) => sum + c.entries.length, 0),
    }))
}

/** 月份键校验：'YYYY-MM' */
export function isValidMonthKey(key: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) return false
  const month = Number(key.slice(5, 7))
  return month >= 1 && month <= 12
}

/** 取某个月的章节（按阅读顺序）；无日记返回 null */
export function chapterOf(entries: readonly DiaryEntry[], monthKey: string): MonthChapter | null {
  if (!isValidMonthKey(monthKey)) return null
  const matched = entries.filter((e) => e.happenedOn.slice(0, 7) === monthKey)
  if (matched.length === 0) return null
  const sorted = [...matched].sort(
    (a, b) => a.happenedOn.localeCompare(b.happenedOn) || a.createdAt.localeCompare(b.createdAt),
  )
  return {
    key: monthKey,
    year: Number(monthKey.slice(0, 4)),
    month: Number(monthKey.slice(5, 7)),
    entries: sorted,
    firstDate: sorted[0]!.happenedOn,
    lastDate: sorted[sorted.length - 1]!.happenedOn,
  }
}
