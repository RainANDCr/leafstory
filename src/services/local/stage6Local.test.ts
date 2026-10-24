/**
 * 阶段 6 本地模式测试：
 * - 个人数据导出的排除项：伴侣私密日记/未到期信件正文/未揭晓答案不包含；
 *   可读内容（自己的私密、共享、已解锁信件、已揭晓问答）包含；
 * - 解除配对的后果：双方失去共同数据访问、自己写的日记仍可见、共同数据未删除。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as local from './localBackend'
import { exportMyData } from '../exportService'

const PASSWORD = 'leaf-story-123'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

async function setupCouple() {
  await local.signUp('a@x.com', PASSWORD, '猴子大王')
  const code = await local.createCoupleSpace('')
  const coupleId = (await local.getCoupleSnapshot(local.fetchSession().userId!)).info!.coupleId
  const aId = local.fetchSession().userId!
  await local.signUp('b@x.com', PASSWORD, '追落叶')
  await local.joinCouple(code)
  const bId = local.fetchSession().userId!
  return { coupleId, aId, bId, code }
}

describe('个人数据导出（排除项）', () => {
  it('B 导出：含共享与自己的私密日记；A 的私密日记、未到期信正文、未揭晓答案不包含', async () => {
    const { coupleId, aId, bId } = await setupCouple()

    await local.signIn('a@x.com', PASSWORD)
    await local.createDiary({ coupleId, title: '共享日记', content: 'shared-content', happenedOn: '2026-05-01', mood: 'joy', category: null, visibility: 'shared', status: 'published' })
    await local.createDiary({ coupleId, title: 'A 的秘密', content: 'a-private-secret', happenedOn: '2026-05-02', mood: 'joy', category: null, visibility: 'private', status: 'published' })
    await local.sealLetter(coupleId, aId, { recipient: 'partner', unlockAt: new Date(Date.now() + 3600_000).toISOString(), title: '未来的信', body: 'letter-secret-body' })
    // A 发起问答并提交
    await local.startQuizSession(coupleId, aId, '11111111-1111-4111-8111-111111111101')
    const sessionId = (await local.listQuizSessions(coupleId, aId, bId))[0]!.id
    await local.saveQuizAnswer(sessionId, { content: 'A 的答案 quiz-answer-a', emoji: null, submit: true })

    // B 写自己的私密并导出
    await local.signIn('b@x.com', PASSWORD)
    await local.createDiary({ coupleId, title: 'B 的秘密', content: 'b-private-ok', happenedOn: '2026-05-03', mood: 'joy', category: null, visibility: 'private', status: 'published' })

    const { json } = await exportMyData(bId, { includePhotos: false })
    const data = JSON.parse(json) as { couple: { diaries: Array<{ title: string; content: string }>; letters: Array<{ content: { title: string } | null }>; quizzes: Array<{ myAnswer: { content: string } | null; partnerAnswer: { content: string } | null }> } }

    const diaryText = JSON.stringify(data.couple.diaries)
    expect(diaryText).toContain('共享日记')
    expect(diaryText).toContain('B 的秘密')
    expect(diaryText).not.toContain('a-private-secret')

    // 未到期信件：只有封套，正文为 null
    expect(data.couple.letters).toHaveLength(1)
    expect(data.couple.letters[0]!.content).toBeNull()
    expect(json).not.toContain('letter-secret-body')

    // 未揭晓问答：B 未提交 → partnerAnswer 不可见
    const quiz = data.couple.quizzes[0]!
    expect(quiz.myAnswer).toBeNull()
    expect(quiz.partnerAnswer).toBeNull()
    expect(json).not.toContain('quiz-answer-a')
  })

  it('到期信件对收件人导出正文；已揭晓问答包含双方答案', async () => {
    const { coupleId, aId, bId } = await setupCouple()
    await local.signIn('a@x.com', PASSWORD)
    await local.sealLetter(coupleId, aId, { recipient: 'partner', unlockAt: new Date(Date.now() - 1000).toISOString(), title: 't', body: 'b' }).catch(() => {
      // 过去的 unlockAt 会被拒，绕过校验直接构造
    })
    // 直接构造一封已到期的信（本地存储）
    const letters = JSON.parse(localStorage.getItem('leafstory:letters') ?? '{}') as Record<string, unknown>
    letters['lit-1'] = { id: 'lit-1', coupleId, authorId: aId, recipient: 'partner', unlockAt: new Date(Date.now() - 2000).toISOString(), status: 'sealed', title: '已到期的信', body: 'expired-letter-body', createdAt: new Date(Date.now() - 3000).toISOString(), updatedAt: new Date(Date.now() - 3000).toISOString() }
    localStorage.setItem('leafstory:letters', JSON.stringify(letters))

    // 双方提交问答
    await local.startQuizSession(coupleId, aId, '11111111-1111-4111-8111-111111111102')
    const sessionId = (await local.listQuizSessions(coupleId, aId, bId))[0]!.id
    await local.saveQuizAnswer(sessionId, { content: 'A 答', emoji: null, submit: true })
    await local.signIn('b@x.com', PASSWORD)
    await local.saveQuizAnswer(sessionId, { content: 'B 答', emoji: null, submit: true })

    const { json } = await exportMyData(bId, { includePhotos: false })
    expect(json).toContain('expired-letter-body') // 到期可读 → 导出正文
    const data = JSON.parse(json) as { couple: { quizzes: Array<{ myAnswer: { content: string } | null; partnerAnswer: { content: string } | null }> } }
    expect(data.couple.quizzes[0]!.myAnswer?.content).toBe('B 答')
    expect(data.couple.quizzes[0]!.partnerAnswer?.content).toBe('A 答')
  })
})

describe('解除配对的后果', () => {
  it('双方失去共同数据访问；各自日记仍可见；共同数据被保留（冻结）', async () => {
    const { coupleId, aId, bId } = await setupCouple()
    await local.signIn('a@x.com', PASSWORD)
    await local.createDiary({ coupleId, title: 'A 写的', content: 'x', happenedOn: '2026-05-01', mood: 'joy', category: null, visibility: 'shared', status: 'published' })
    await local.createWish(coupleId, aId, { title: '一起看海', description: null, dueDate: null, priority: 'normal', placeNote: null })

    await local.dissolveCouple()

    // A：自己日记仍可见；共同数据（心愿）不可见
    const aView = await local.getCoupleSnapshot(aId)
    expect(aView.state).toBe('unpaired')
    const aDiaries = await local.listDiaries(0)
    expect(aDiaries.total).toBe(1)
    expect(aDiaries.items[0]!.title).toBe('A 写的')
    expect(await local.listWishes(coupleId)).toEqual([])

    // B：一切共同数据不可见
    await local.signIn('b@x.com', PASSWORD)
    expect((await local.getCoupleSnapshot(bId)).state).toBe('unpaired')
    expect((await local.listDiaries(0)).total).toBe(0)
    expect(await local.listWishes(coupleId)).toEqual([])

    // 共同数据被保留（冻结而非删除）：原始存储仍在，仅因失去成员资格而不可见
    const rawWishes = JSON.parse(localStorage.getItem('leafstory:wishes') ?? '{}') as Record<string, unknown>
    expect(Object.keys(rawWishes)).toHaveLength(1)
  })
})
