import { describe, expect, it } from 'vitest'
import { MOODS, getMood, validateDiaryForm } from './types'

describe('MOODS 心情与叶子颜色', () => {
  it('六种心情，键与颜色各自唯一（色觉区分度的基础）', () => {
    expect(MOODS).toHaveLength(6)
    expect(new Set(MOODS.map((m) => m.key)).size).toBe(6)
    expect(new Set(MOODS.map((m) => m.color)).size).toBe(6)
  })

  it('getMood 对未知值回退到第一项，不抛错', () => {
    expect(getMood('joy').key).toBe('joy')
    expect(getMood('nonexistent').key).toBe('joy')
  })
})

describe('validateDiaryForm', () => {
  it('正文为空报错', () => {
    const errors = validateDiaryForm({ title: '', content: '   ', happenedOn: '2026-10-24' })
    expect(errors.content).toBeTruthy()
  })

  it('标题超过 120 字报错', () => {
    const errors = validateDiaryForm({ title: 'a'.repeat(121), content: '内容', happenedOn: '2026-10-24' })
    expect(errors.title).toBeTruthy()
  })

  it('日期格式非法报错', () => {
    const errors = validateDiaryForm({ title: '', content: '内容', happenedOn: '2026/10/24' })
    expect(errors.happenedOn).toBeTruthy()
  })

  it('合法输入通过', () => {
    expect(validateDiaryForm({ title: '今天', content: '写了一点', happenedOn: '2026-10-24' })).toEqual({})
  })
})
