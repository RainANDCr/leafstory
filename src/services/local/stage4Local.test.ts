/**
 * 阶段 4 本地模式测试：
 * - 问答两阶段可见性：草稿不可见、单方提交看不到对方、双方提交后互相可见、
 *   提前结束不泄露未提交答案、收藏为日记只写可见内容、第三人不可见；
 * - 地点：关联可见性跟随日记（私密日记不透过地点泄露）。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as local from './localBackend'
import { QUESTION_BANK, pickQuestion } from '@/features/quiz/questionBank'

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

const Q = QUESTION_BANK[0]!

describe('默契小问答：两阶段可见性', () => {
  it('完整流：发起 → 各自作答 → 双方提交后互相可见', async () => {
    const { coupleId, aId, bId } = await setupCouple()

    await local.signIn('a@x.com', PASSWORD)
    await local.startQuizSession(coupleId, aId, Q.id)

    // A 存草稿
    await local.saveQuizAnswer((await local.listQuizSessions(coupleId, aId, bId))[0]!.id, {
      content: 'A 的草稿答案',
      emoji: '😊',
      submit: false,
    })

    // B 视角：看不到 A 的草稿（连答案是否存在都不可知）
    await local.signIn('b@x.com', PASSWORD)
    let bView = await local.listQuizSessions(coupleId, bId, aId)
    expect(bView[0]!.partnerAnswer).toBeNull()
    expect(bView[0]!.bothSubmitted).toBe(false)

    // B 提交自己的答案
    await local.saveQuizAnswer(bView[0]!.id, { content: 'B 的答案', emoji: '❤️', submit: true })
    bView = await local.listQuizSessions(coupleId, bId, aId)
    // B 已提交但 A 还没提交：B 看不到 A 的（草稿）答案
    expect(bView[0]!.partnerAnswer).toBeNull()

    // A 提交
    await local.signIn('a@x.com', PASSWORD)
    const aView1 = await local.listQuizSessions(coupleId, aId, bId)
    expect(aView1[0]!.partnerAnswer).toBeNull() // A 提交前也看不到 B 的
    await local.saveQuizAnswer(aView1[0]!.id, { content: 'A 的答案', emoji: null, submit: true })

    // 双方都提交：会话揭晓，双方互相可见
    const aView2 = await local.listQuizSessions(coupleId, aId, bId)
    expect(aView2[0]!.status).toBe('revealed')
    expect(aView2[0]!.partnerAnswer?.content).toBe('B 的答案')

    await local.signIn('b@x.com', PASSWORD)
    const bView2 = await local.listQuizSessions(coupleId, bId, aId)
    expect(bView2[0]!.partnerAnswer?.content).toBe('A 的答案')
  })

  it('提前结束：只展示已提交的答案，未提交一方不泄露', async () => {
    const { coupleId, aId, bId } = await setupCouple()
    await local.signIn('a@x.com', PASSWORD)
    await local.startQuizSession(coupleId, aId, Q.id)
    await local.saveQuizAnswer((await local.listQuizSessions(coupleId, aId, bId))[0]!.id, {
      content: 'A 提前结束前已提交',
      emoji: null,
      submit: true,
    })

    // B（未提交）提前结束
    await local.signIn('b@x.com', PASSWORD)
    const bView1 = await local.listQuizSessions(coupleId, bId, aId)
    await local.endQuizEarly(bView1[0]!.id, bId)

    const bView2 = await local.listQuizSessions(coupleId, bId, aId)
    expect(bView2[0]!.status).toBe('revealed')
    expect(bView2[0]!.partnerAnswer).toBeNull() // B 自己没提交 → 仍看不到 A 的
  })

  it('跳过：双方都没提交时可以删掉换题；有人提交后不能跳过', async () => {
    const { coupleId, aId, bId } = await setupCouple()
    await local.signIn('a@x.com', PASSWORD)
    await local.startQuizSession(coupleId, aId, Q.id)
    const sessionId = (await local.listQuizSessions(coupleId, aId, bId))[0]!.id

    await local.saveQuizAnswer(sessionId, { content: '草稿', emoji: null, submit: false })
    await local.skipQuizSession(sessionId) // 只有草稿也可以跳过
    expect(await local.listQuizSessions(coupleId, aId, bId)).toEqual([])

    await local.startQuizSession(coupleId, aId, pickQuestion('all', [Q.id]).id)
    const s2 = (await local.listQuizSessions(coupleId, aId, bId))[0]!
    await local.saveQuizAnswer(s2.id, { content: '已提交', emoji: null, submit: true })
    await expect(local.skipQuizSession(s2.id)).rejects.toThrow('不能跳过')
  })

  it('收藏为日记：写入当前可见内容，并登记收藏', async () => {
    const { coupleId, aId, bId } = await setupCouple()
    await local.signIn('a@x.com', PASSWORD)
    await local.startQuizSession(coupleId, aId, Q.id)
    const sessionId = (await local.listQuizSessions(coupleId, aId, bId))[0]!.id
    await local.saveQuizAnswer(sessionId, { content: 'A 的答案', emoji: '🍂', submit: true })
    await local.signIn('b@x.com', PASSWORD)
    await local.saveQuizAnswer(sessionId, { content: 'B 的答案', emoji: null, submit: true })

    const diaryId = await local.createDiary({
      coupleId,
      title: `默契问答：${Q.content}`,
      content: '【问题】…',
      happenedOn: '2026-10-25',
      mood: 'heartbeat',
      category: '默契问答',
      visibility: 'shared',
      status: 'published',
    })
    await local.favoriteQuizToDiary(sessionId, diaryId, bId)

    const sessions = await local.listQuizSessions(coupleId, bId, aId)
    expect(sessions[0]!.isFavorite).toBe(true)
  })

  it('第三人不可见任何问答', async () => {
    const { coupleId, aId } = await setupCouple()
    await local.signIn('a@x.com', PASSWORD)
    await local.startQuizSession(coupleId, aId, Q.id)
    await local.signUp('c@x.com', PASSWORD, '路人')
    expect(await local.listQuizSessions(coupleId, 'c-uid', aId)).toEqual([])
  })
})

describe('地点足迹', () => {
  it('关联日记可见性跟随日记：私密日记不透过地点泄露', async () => {
    const { coupleId, aId, bId } = await setupCouple()
    await local.signIn('a@x.com', PASSWORD)
    const sharedId = await local.createDiary({
      coupleId,
      title: '共享的一天',
      content: 'c',
      happenedOn: '2026-10-01',
      mood: 'joy',
      category: null,
      visibility: 'shared',
      status: 'published',
    })
    const privateId = await local.createDiary({
      coupleId,
      title: '私密的一天',
      content: 'secret',
      happenedOn: '2026-10-02',
      mood: 'joy',
      category: null,
      visibility: 'private',
      status: 'published',
    })
    await local.createPlace(coupleId, aId, {
      name: '见面咖啡店',
      region: '杭州',
      note: null,
      happenedOn: '2026-10-02',
      latitude: 30.25,
      longitude: 120.16,
      isSpecial: true,
      specialLabel: '第一次见面',
      diaryIds: [sharedId, privateId],
    })

    // 作者：能看到两条关联
    let places = await local.listPlaces(coupleId)
    expect(places).toHaveLength(1)
    expect(places[0]!.linkedDiaries).toHaveLength(2)

    // 伴侣：私密日记的关联不可见（不泄露其存在）
    await local.signIn('b@x.com', PASSWORD)
    places = await local.listPlaces(coupleId)
    expect(places[0]!.linkedDiaries.map((d) => d.id)).toEqual([sharedId])

    // 伴侣试图直接关联 A 的私密日记：被拒
    await expect(
      local.createPlace(coupleId, bId, {
        name: '试探',
        region: null,
        note: null,
        happenedOn: null,
        latitude: null,
        longitude: null,
        isSpecial: false,
        specialLabel: null,
        diaryIds: [privateId],
      }),
    ).rejects.toThrow('NOT_FOUND')

    // 删除地点不影响日记
    await local.signIn('a@x.com', PASSWORD)
    await local.deletePlace(places[0]!.id)
    expect(await local.listPlaces(coupleId)).toEqual([])
    expect((await local.getDiaryDetail(sharedId)).entry.title).toBe('共享的一天')
  })
})
