import { describe, expect, it } from 'vitest'
import { chapterOf, groupByMonth, isValidMonthKey } from './logic'
import type { DiaryEntry } from '@/features/diary/types'

function make(id: string, happenedOn: string, createdAt = '2026-01-01T00:00:00Z'): DiaryEntry {
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
    createdAt,
    updatedAt: createdAt,
  }
}

describe('groupByMonth', () => {
  it('按年倒序、月份倒序分组；章节内按发生日升序（阅读顺序）', () => {
    const entries = [
      make('a', '2026-10-24'),
      make('b', '2026-10-01'),
      make('c', '2026-09-18'),
      make('d', '2025-12-31'),
    ]
    const years = groupByMonth(entries)
    expect(years.map((y) => y.year)).toEqual([2026, 2025])

    const y2026 = years[0]!
    expect(y2026.chapters.map((c) => c.month)).toEqual([10, 9])
    expect(y2026.total).toBe(3)

    const oct = y2026.chapters[0]!
    expect(oct.entries.map((e) => e.id)).toEqual(['b', 'a']) // 升序
    expect(oct.firstDate).toBe('2026-10-01')
    expect(oct.lastDate).toBe('2026-10-24')
  })

  it('空输入返回空数组', () => {
    expect(groupByMonth([])).toEqual([])
  })
})

describe('isValidMonthKey', () => {
  it('接受 YYYY-MM，拒绝非法', () => {
    expect(isValidMonthKey('2026-10')).toBe(true)
    expect(isValidMonthKey('2026-00')).toBe(false)
    expect(isValidMonthKey('2026-13')).toBe(false)
    expect(isValidMonthKey('202610')).toBe(false)
  })
})

describe('chapterOf', () => {
  it('取指定月份并按时间排序', () => {
    const entries = [make('a', '2026-10-24'), make('b', '2026-10-02'), make('c', '2026-09-01')]
    const chapter = chapterOf(entries, '2026-10')
    expect(chapter?.entries.map((e) => e.id)).toEqual(['b', 'a'])
  })

  it('月份无日记或键非法返回 null', () => {
    expect(chapterOf([make('a', '2026-10-01')], '2025-01')).toBeNull()
    expect(chapterOf([], 'bad')).toBeNull()
  })
})
