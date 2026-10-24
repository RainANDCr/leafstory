import { describe, expect, it } from 'vitest'
import { anniversaryCountdown, daysBetween, formatDateHuman, nextOccurrence, parseISODate, toISODate } from './dates'

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

describe('nextOccurrence', () => {
  const today = new Date(2026, 9, 24) // 2026-10-24

  it('每年重复：今年的发生日已过则取明年', () => {
    expect(nextOccurrence('2024-06-01', true, today)).toBe('2027-06-01')
  })

  it('每年重复：今年的发生日未到则取今年', () => {
    expect(nextOccurrence('2024-12-30', true, today)).toBe('2026-12-30')
  })

  it('每年重复：恰好在今天', () => {
    expect(nextOccurrence('2020-10-24', true, today)).toBe('2026-10-24')
  })

  it('每年重复：2/29 在平年收敛到 2/28', () => {
    expect(nextOccurrence('2024-02-29', true, new Date(2026, 11, 31))).toBe('2027-02-28')
    expect(nextOccurrence('2024-02-29', true, new Date(2028, 0, 1))).toBe('2028-02-29')
  })

  it('一次性事件返回原日期', () => {
    expect(nextOccurrence('2020-05-20', false, today)).toBe('2020-05-20')
  })
})

describe('anniversaryCountdown', () => {
  it('未来事件：还有 N 天', () => {
    const c = anniversaryCountdown('2026-10-29', true, new Date(2026, 9, 24))
    expect(c).toEqual({ status: 'upcoming', days: 5, nextISO: '2026-10-29' })
  })

  it('就是今天', () => {
    const c = anniversaryCountdown('2020-10-24', true, new Date(2026, 9, 24))
    expect(c.status).toBe('today')
    expect(c.days).toBe(0)
  })

  it('按年重复的过去事件：倒计到下一次（跨年）', () => {
    const c = anniversaryCountdown('2020-01-01', true, new Date(2026, 9, 24))
    expect(c.status).toBe('upcoming')
    expect(c.nextISO).toBe('2027-01-01')
  })

  it('一次性过去事件：已过 N 天', () => {
    const c = anniversaryCountdown('2026-10-01', false, new Date(2026, 9, 24))
    expect(c).toEqual({ status: 'passed', days: 23, nextISO: '2026-10-01' })
  })
})
