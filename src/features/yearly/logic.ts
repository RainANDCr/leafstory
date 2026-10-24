/**
 * 年度金叶：确定性统计（无 AI 参与）。
 * 原则：数据少也克制美观（「这一年的几片叶子」）；绝不虚构统计；
 * 「最珍贵的一天」只由用户选择，应用不评价。
 */
import type { DiaryEntry } from '@/features/diary/types'
import type { Wish } from '@/services/wishService'
import type { Place } from '@/services/placeService'

export interface YearStats {
  year: number
  diaryCount: number
  photoCount: number
  cityCount: number
  wishDoneCount: number
  /** 12 个月的日记数分布 */
  monthly: number[]
  /** 这一年写过日记的日期（供「最珍贵的一天」挑选） */
  diaryDays: string[]
}

function yearOf(iso: string | null): number | null {
  if (!iso) return null
  const y = Number(iso.slice(0, 4))
  return Number.isFinite(y) ? y : null
}

export function buildYearStats(
  year: number,
  entries: readonly DiaryEntry[],
  wishes: readonly Wish[],
  places: readonly Place[],
): YearStats {
  const yearEntries = entries.filter((e) => yearOf(e.happenedOn) === year)
  const monthly = Array.from({ length: 12 }, () => 0)
  for (const e of yearEntries) {
    const m = Number(e.happenedOn.slice(5, 7))
    if (m >= 1 && m <= 12) monthly[m - 1]! += 1
  }
  const cityCount = new Set(
    places.filter((p) => yearOf(p.happenedOn) === year && p.region).map((p) => p.region),
  ).size
  const wishDoneCount = wishes.filter((w) => w.status === 'done' && yearOf(w.completedAt?.slice(0, 10) ?? null) === year).length

  return {
    year,
    diaryCount: yearEntries.length,
    photoCount: yearEntries.reduce((s, e) => s + (e.mediaCount ?? 0), 0),
    cityCount,
    wishDoneCount,
    monthly,
    diaryDays: Array.from(new Set(yearEntries.map((e) => e.happenedOn))).sort(),
  }
}

/** 年份选择候选：日记出现过的年份（倒序）∪ 当前年 */
export function availableYears(entries: readonly DiaryEntry[], currentYear = new Date().getFullYear()): number[] {
  const years = new Set<number>([currentYear])
  for (const e of entries) {
    const y = yearOf(e.happenedOn)
    if (y) years.add(y)
  }
  return Array.from(years).sort((a, b) => b - a)
}
