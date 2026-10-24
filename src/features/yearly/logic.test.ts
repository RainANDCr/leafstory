import { describe, expect, it } from 'vitest'
import { availableYears, buildYearStats } from './logic'
import type { DiaryEntry } from '@/features/diary/types'
import type { Wish } from '@/services/wishService'
import type { Place } from '@/services/placeService'

function entry(id: string, happenedOn: string, mediaCount = 0): DiaryEntry {
  return {
    id,
    coupleId: 'c1',
    authorId: 'u1',
    title: id,
    content: '内容',
    happenedOn,
    mood: 'joy',
    category: null,
    visibility: 'shared',
    status: 'published',
    createdAt: `${happenedOn}T00:00:00Z`,
    updatedAt: '',
    mediaCount,
  }
}

function wish(id: string, status: Wish['status'], completedAt: string | null): Wish {
  return {
    id,
    coupleId: 'c1',
    title: id,
    description: null,
    createdBy: 'u1',
    dueDate: null,
    priority: 'normal',
    status,
    placeNote: null,
    completedAt,
    completedBy: null,
    createdAt: '',
    updatedAt: '',
    linkedDiaryId: null,
  }
}

function place(region: string | null, happenedOn: string | null): Place {
  return {
    id: region ?? Math.random().toString(),
    coupleId: 'c1',
    name: 'p',
    region,
    note: null,
    happenedOn: happenedOn,
    latitude: null,
    longitude: null,
    isSpecial: false,
    specialLabel: null,
    createdBy: '',
    createdAt: '',
    updatedAt: '',
    linkedDiaries: [],
  }
}

describe('buildYearStats', () => {
  it('按年精确过滤：跨年日期不串年', () => {
    const entries = [entry('a', '2026-10-01'), entry('b', '2025-12-31'), entry('c', '2026-01-01'), entry('d', '2027-01-01')]
    const stats = buildYearStats(2026, entries, [], [])
    expect(stats.diaryCount).toBe(2)
    expect(stats.diaryDays).toEqual(['2026-01-01', '2026-10-01'])
  })

  it('照片数为各篇 mediaCount 之和；月度分布正确', () => {
    const entries = [entry('a', '2026-01-05', 2), entry('b', '2026-01-20', 1), entry('c', '2026-12-31', 4)]
    const stats = buildYearStats(2026, entries, [], [])
    expect(stats.photoCount).toBe(7)
    expect(stats.monthly[0]).toBe(2)
    expect(stats.monthly[11]).toBe(1)
    expect(stats.monthly[5]).toBe(0)
  })

  it('心愿只计当年完成的；未完成/他年完成不计', () => {
    const wishes = [wish('w1', 'done', '2026-05-01'), wish('w2', 'done', '2025-05-01'), wish('w3', 'planned', null), wish('w4', 'done', null)]
    const stats = buildYearStats(2026, [], wishes, [])
    expect(stats.wishDoneCount).toBe(1)
  })

  it('城市数为当年有日期地点的唯一 region 数', () => {
    const places = [place('杭州', '2026-03-01'), place('杭州', '2026-08-01'), place('上海', '2026-04-01'), place('北京', '2025-04-01'), place(null, '2026-04-01')]
    const stats = buildYearStats(2026, [], [], places)
    expect(stats.cityCount).toBe(2)
  })

  it('空年份：全部为零（克制的「几片叶子」）', () => {
    const stats = buildYearStats(2020, [], [], [])
    expect(stats).toEqual({ year: 2020, diaryCount: 0, photoCount: 0, cityCount: 0, wishDoneCount: 0, monthly: Array(12).fill(0), diaryDays: [] })
  })
})

describe('availableYears', () => {
  it('日记年份 ∪ 当前年，倒序', () => {
    const years = availableYears([entry('a', '2024-01-01'), entry('b', '2026-01-01')], 2025)
    expect(years).toEqual([2026, 2025, 2024])
  })
})
