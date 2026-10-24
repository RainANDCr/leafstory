import { describe, expect, it } from 'vitest'
import { daysBetween, formatDateHuman, parseISODate, toISODate } from './dates'

describe('toISODate', () => {
  it('把本地日期格式化为 yyyy-mm-dd', () => {
    expect(toISODate(new Date(2026, 9, 24))).toBe('2026-10-24')
    expect(toISODate(new Date(2026, 0, 1))).toBe('2026-01-01')
  })
})

describe('parseISODate', () => {
  it('解析为本地时区当日零点（不经过 UTC 偏移）', () => {
    const d = parseISODate('2026-10-24')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(9)
    expect(d.getDate()).toBe(24)
    expect(d.getHours()).toBe(0)
  })

  it('拒绝非法格式', () => {
    expect(() => parseISODate('2026/10/24')).toThrow()
    expect(() => parseISODate('')).toThrow()
  })
})

describe('daysBetween', () => {
  it('计算日历日差：纪念日「已经过多少天 / 还有多少天」', () => {
    expect(daysBetween('2026-10-01', '2026-10-24')).toBe(23)
    expect(daysBetween('2025-10-24', '2026-10-24')).toBe(365)
    expect(daysBetween('2026-10-24', '2026-10-24')).toBe(0)
  })

  it('跨闰年二月计算正确', () => {
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2)
    expect(daysBetween('2023-02-28', '2023-03-01')).toBe(1)
  })

  it('结束日早于开始日时为负数', () => {
    expect(daysBetween('2026-10-24', '2026-10-01')).toBe(-23)
  })
})

describe('formatDateHuman', () => {
  it('输出中文年月日', () => {
    expect(formatDateHuman('2026-10-24')).toBe('2026年10月24日')
  })
})
