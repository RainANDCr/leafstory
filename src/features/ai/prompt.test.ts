import { describe, expect, it } from 'vitest'
import { buildSystemPrompt, buildUserPrompt, MAX_TOTAL_CHARS } from './prompt'
import { styleInstruction, lengthInstruction } from './config'

const materials = [
  { id: 'e1', title: '看海', happenedOn: '2026-10-01', content: '浪很大，风很轻，我们坐在堤上没说话。' },
  { id: 'e2', title: '', happenedOn: '2026-10-02', content: '第二天吃了小馄饨。' },
]

const options = {
  styleInstruction: styleInstruction('prose'),
  lengthInstruction: lengthInstruction('medium'),
  keepOriginal: true,
  leafImagery: false,
}

describe('buildSystemPrompt', () => {
  it('包含防捏造与「只输出正文」的固定约束', () => {
    const s = buildSystemPrompt()
    expect(s).toContain('唯一事实来源')
    expect(s).toContain('禁止虚构')
    expect(s).toContain('只输出润色后的正文')
  })
})

describe('buildUserPrompt', () => {
  it('逐篇包含选中的日记；未选中的不出现', () => {
    const p = buildUserPrompt([materials[0]!], options)
    expect(p).toContain('看海')
    expect(p).toContain('浪很大')
    expect(p).not.toContain('小馄饨')
  })

  it('参数项体现在提示里（保留原句 / 意象）', () => {
    const p = buildUserPrompt(materials, { ...options, keepOriginal: true, leafImagery: true })
    expect(p).toContain('尽量保留原句')
    expect(p).toContain('叶子、森林、季节')
  })

  it('超长素材被截断并标注，不静默', () => {
    const long = { id: 'x', title: '长文', happenedOn: '2026-01-01', content: '字'.repeat(20_000) }
    const p = buildUserPrompt([long], options)
    expect(p).toContain('已截断')
    expect(p.length).toBeLessThan(long.content.length + 500)
  })

  it('总量上限生效', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: `e${i}`,
      title: `t${i}`,
      happenedOn: '2026-01-01',
      content: '内容'.repeat(2000),
    }))
    const p = buildUserPrompt(many, options)
    expect(p.length).toBeLessThanOrEqual(MAX_TOTAL_CHARS + 800)
    expect(p).toContain('已达上限')
  })
})
