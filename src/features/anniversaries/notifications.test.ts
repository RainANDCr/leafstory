import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NOTIFY_LOOKAHEAD_DAYS, pickNotificationTargets } from './notifications'
import type { Anniversary } from '@/services/anniversaryService'

function ann(id: string, date: string, repeatsYearly = true): Anniversary {
  return {
    id,
    coupleId: 'c1',
    title: id,
    kind: 'together',
    anniversaryDate: date,
    repeatsYearly,
    note: null,
    linkedDiaryId: null,
    createdBy: 'u1',
    createdAt: '',
  }
}

describe('pickNotificationTargets', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('未来 30 天内的每年重复纪念日生成目标（当天早 9 点）', () => {
    const now = new Date(2026, 9, 25, 12, 0)
    const targets = pickNotificationTargets([ann('在一起', '2024-11-01')], now)
    expect(targets).toHaveLength(1)
    expect(targets[0]!.fireAt.getFullYear()).toBe(2026)
    expect(targets[0]!.fireAt.getMonth()).toBe(10)
    expect(targets[0]!.fireAt.getDate()).toBe(1)
    expect(targets[0]!.fireAt.getHours()).toBe(9)
    expect(targets[0]!.body).toContain('天')
  })

  it('今天早 9 点已过则跳过；超出 30 天不含', () => {
    const now = new Date(2026, 9, 25, 12, 0) // 10-25 中午
    const today = ann('今天', '2020-10-25') // 今年 10-25 09:00 已过 → 跳过
    const far = ann('远处', '2024-12-31') // 距今 >30 天 → 不含
    expect(pickNotificationTargets([today, far], now)).toEqual([])
  })

  it('跨年取下一次发生日；一次性过去事件不产生目标', () => {
    const now = new Date(2026, 11, 20, 8, 0) // 12-20 早 8 点
    const targets = pickNotificationTargets([ann('跨年', '2020-01-05')], now) // 今年已过 → 明年 1-5，16 天后
    expect(targets).toHaveLength(1)
    expect(targets[0]!.fireAt.getFullYear()).toBe(2027)
    expect(targets[0]!.id).toBe('跨年')

    expect(pickNotificationTargets([ann('一次性', '2026-01-01', false)], now)).toEqual([])
  })

  it('目标按触发时间排序，且不超过未来窗口', () => {
    const now = new Date(2026, 0, 1, 0, 0)
    const many = Array.from({ length: 40 }, (_, i) => ann(`a${i}`, `2020-01-${String((i % 28) + 1).padStart(2, '0')}`))
    const targets = pickNotificationTargets(many, now)
    for (let i = 1; i < targets.length; i++) {
      expect(targets[i]!.fireAt.getTime()).toBeGreaterThanOrEqual(targets[i - 1]!.fireAt.getTime())
    }
    // 每个目标都在窗口内
    for (const t of targets) {
      const days = (t.fireAt.getTime() - now.getTime()) / 86_400_000
      expect(days).toBeLessThanOrEqual(NOTIFY_LOOKAHEAD_DAYS + 1)
    }
  })
})
