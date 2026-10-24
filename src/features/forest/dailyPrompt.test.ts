import { describe, expect, it } from 'vitest'
import { seasonOf } from './season'
import { dailyPrompt } from './dailyPrompt'

describe('seasonOf', () => {
  it('按月份推算季节（仅外观用途）', () => {
    expect(seasonOf(new Date(2026, 2, 1))).toBe('spring') // 3 月
    expect(seasonOf(new Date(2026, 6, 15))).toBe('summer') // 7 月
    expect(seasonOf(new Date(2026, 9, 24))).toBe('autumn') // 10 月
    expect(seasonOf(new Date(2026, 11, 1))).toBe('winter') // 12 月
    expect(seasonOf(new Date(2026, 0, 20))).toBe('winter') // 1 月
  })
})

describe('dailyPrompt', () => {
  it('同一天返回同一条提示（确定性轮换）', () => {
    const a = dailyPrompt(new Date(2026, 9, 24))
    const b = dailyPrompt(new Date(2026, 9, 24))
    expect(a).toBe(b)
    expect(a.length).toBeGreaterThan(0)
  })

  it('相邻日期可能轮换到不同提示（覆盖取模逻辑不越界）', () => {
    for (let day = 1; day <= 31; day++) {
      expect(() => dailyPrompt(new Date(2026, 9, day))).not.toThrow()
    }
  })
})
