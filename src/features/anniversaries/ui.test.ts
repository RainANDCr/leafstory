import { describe, expect, it } from 'vitest'
import { countdownText, isGoldKind, nextAnniversary, sortForDisplay, withCountdown } from './ui'
import type { Anniversary } from '@/services/anniversaryService'

const today = new Date(2026, 9, 24) // 2026-10-24

function make(partial: Partial<Anniversary>): Anniversary {
  return {
    id: partial.id ?? 'a1',
    coupleId: 'c1',
    title: partial.title ?? '纪念日',
    kind: partial.kind ?? 'custom',
    anniversaryDate: partial.anniversaryDate ?? '2026-10-24',
    repeatsYearly: partial.repeatsYearly ?? true,
    note: null,
    linkedDiaryId: null,
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    ...partial,
  }
}

describe('withCountdown / countdownText', () => {
  it('未来事件显示「还有 N 天」', () => {
    const [view] = withCountdown([make({ anniversaryDate: '2026-10-29' })], today)
    expect(view!.countdown.status).toBe('upcoming')
    expect(countdownText(view!)).toContain('5')
  })

  it('今天的事件显示「今天」', () => {
    const [view] = withCountdown([make({ anniversaryDate: '2020-10-24' })], today)
    expect(countdownText(view!)).toBe('今天')
  })
})

describe('isGoldKind', () => {
  it('相识/在一起/第一次约会是金叶纪念日；生日和自定义不是', () => {
    expect(isGoldKind('met')).toBe(true)
    expect(isGoldKind('together')).toBe(true)
    expect(isGoldKind('first_date')).toBe(true)
    expect(isGoldKind('birthday')).toBe(false)
    expect(isGoldKind('custom')).toBe(false)
  })
})

describe('nextAnniversary', () => {
  it('取最近到来的未来事件', () => {
    const views = withCountdown(
      [
        make({ id: 'far', anniversaryDate: '2026-12-25' }),
        make({ id: 'near', anniversaryDate: '2026-11-01' }),
      ],
      today,
    )
    expect(nextAnniversary(views)?.id).toBe('near')
  })

  it('没有未来事件时回退到最近的按年重复事件', () => {
    const views = withCountdown([make({ id: 'past', anniversaryDate: '2026-01-10', repeatsYearly: true })], today)
    expect(nextAnniversary(views)?.id).toBe('past')
  })

  it('完全没有可用事件时返回 null', () => {
    const views = withCountdown([make({ anniversaryDate: '2026-01-10', repeatsYearly: false })], today)
    expect(nextAnniversary(views)).toBeNull()
  })
})

describe('sortForDisplay', () => {
  it('未来的事件排在已过去的事件之前', () => {
    const sorted = sortForDisplay(
      withCountdown(
        [
          make({ id: 'past', anniversaryDate: '2026-01-01', repeatsYearly: true }),
          make({ id: 'next', anniversaryDate: '2026-11-11' }),
        ],
        today,
      ),
    )
    expect(sorted[0]!.id).toBe('next')
  })
})
