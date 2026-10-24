import { describe, expect, it } from 'vitest'
import { formatUnlockTime, isUnlocked, localInputToUTC, remainingText, utcToLocalInput } from './time'

describe('localInputToUTC / utcToLocalInput', () => {
  it('本地输入 → UTC ISO → 本地输入，往返一致', () => {
    const local = '2027-05-20T08:30'
    const utc = localInputToUTC(local)
    // UTC 字符串以 Z 结尾且合法
    expect(utc).toMatch(/Z$/)
    expect(new Date(utc).getTime()).toBe(new Date(local).getTime())
    // 回显还原（分钟精度）
    expect(utcToLocalInput(utc)).toBe(local)
  })

  it('UTC 存储的时间点与本地输入表示同一时刻（跨时区语义正确）', () => {
    const utc = localInputToUTC('2026-12-31T23:59')
    // 无论运行环境时区如何，UTC 时刻与本地构造一致
    expect(new Date(utc).toISOString()).toBe(new Date(2026, 11, 31, 23, 59).toISOString())
  })
})

describe('isUnlocked / remainingText', () => {
  // 用本地构造的时刻生成 UTC 字符串，避免测试依赖运行环境时区
  const now = new Date(2026, 9, 24, 12, 0)
  const beforeISO = new Date(now.getTime() - 60_000).toISOString()
  const afterISO = new Date(now.getTime() + 60_000).toISOString()

  it('按设备时钟判断是否到期', () => {
    expect(isUnlocked(beforeISO, now)).toBe(true)
    expect(isUnlocked(afterISO, now)).toBe(false)
  })

  it('剩余时间人性化文案', () => {
    expect(remainingText(new Date(now.getTime() + 30 * 60_000).toISOString(), now)).toBe('30 分钟')
    expect(remainingText(new Date(now.getTime() + 6 * 3600_000).toISOString(), now)).toBe('6 小时')
    expect(remainingText(new Date(now.getTime() + 4 * 24 * 3600_000).toISOString(), now)).toBe('4 天')
    expect(remainingText(beforeISO, now)).toBe('')
  })
})

describe('formatUnlockTime', () => {
  it('按本地时区输出可读时间', () => {
    const text = formatUnlockTime('2027-05-20T00:30:00Z')
    expect(text).toMatch(/2027年5月\d+日 \d{2}:\d{2}/)
  })
})
