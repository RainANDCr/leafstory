/**
 * 阶段 3 本地模式测试：心愿流（创建/推进/绑定/删除不连坐）与
 * 时光邮局安全流（封套无内容、未到期拒读、到期可读、撤回、第三人不可见）。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as local from './localBackend'

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
  return { coupleId, aId, code }
}

describe('本地心愿瓶', () => {
  it('创建 → 两人都能看到 → 协同推进到完成（记录完成者）', async () => {
    const { coupleId, aId } = await setupCouple()
    await local.createWish(coupleId, aId, {
      title: '一起看日出',
      description: '在海边',
      dueDate: '2027-01-01',
      priority: 'high',
      placeNote: '海边',
    })

    let wishes = await local.listWishes(coupleId)
    expect(wishes).toHaveLength(1)
    expect(wishes[0]!.status).toBe('wish')
    expect(wishes[0]!.createdBy).toBe(aId)

    // 伴侣也能推进状态
    await local.setWishStatus(wishes[0]!.id, 'done')
    wishes = await local.listWishes(coupleId)
    expect(wishes[0]!.status).toBe('done')
    expect(wishes[0]!.completedAt).toBeTruthy()
  })

  it('绑定日记：链接可见；删除心愿不删除日记', async () => {
    const { coupleId, aId } = await setupCouple()
    const entryId = await local.createDiary({
      coupleId,
      title: '看日出啦',
      content: '真的看到了',
      happenedOn: '2027-01-01',
      mood: 'joy',
      category: null,
      visibility: 'shared',
      status: 'published',
    })
    await local.createWish(coupleId, aId, { title: '看日出', description: null, dueDate: null, priority: 'normal', placeNote: null })
    const wish = (await local.listWishes(coupleId))[0]!

    await local.linkWishDiary(wish.id, entryId, aId)
    expect((await local.listWishes(coupleId))[0]!.linkedDiaryId).toBe(entryId)

    // 删除心愿：日记仍在
    await local.deleteWish(wish.id)
    expect(await local.listWishes(coupleId)).toEqual([])
    const diary = await local.getDiaryDetail(entryId)
    expect(diary.entry.title).toBe('看日出啦')

    // 重新解绑（换为 null）
    await local.createWish(coupleId, aId, { title: 'w2', description: null, dueDate: null, priority: 'normal', placeNote: null })
    const w2 = (await local.listWishes(coupleId))[0]!
    await local.linkWishDiary(w2.id, entryId, aId)
    await local.linkWishDiary(w2.id, null, aId)
    expect((await local.listWishes(coupleId))[0]!.linkedDiaryId).toBeNull()
  })

  it('状态事件被记录（created / status_changed）', async () => {
    const { coupleId, aId } = await setupCouple()
    await local.createWish(coupleId, aId, { title: 'w', description: null, dueDate: null, priority: 'low', placeNote: null })
    const wish = (await local.listWishes(coupleId))[0]!
    await local.setWishStatus(wish.id, 'planned')
    await local.setWishStatus(wish.id, 'done')
    // 事件在本地存储中可查（数组长度 ≥ 3：created + 两次 status_changed）
    const raw = JSON.parse(localStorage.getItem('leafstory:wish_events') ?? '[]') as unknown[]
    expect(raw.length).toBeGreaterThanOrEqual(3)
  })
})

describe('本地时光邮局（安全流）', () => {
  it('封存 → 封套不含标题正文 → 未到期收件人被拒 → 到期后可读', async () => {
    const { coupleId, aId } = await setupCouple()
    const unlockAt = new Date(Date.now() + 3600_000).toISOString()
    await local.sealLetter(coupleId, aId, { recipient: 'partner', unlockAt, title: '一年后的我们', body: '希望你们还在一起看落叶。' })

    // 收件人视角：封套列表不含标题/正文
    await local.signIn('b@x.com', PASSWORD)
    const envelopes = await local.listLetters(coupleId)
    expect(envelopes).toHaveLength(1)
    expect(JSON.stringify(envelopes[0])).not.toContain('一年后的我们')
    expect(JSON.stringify(envelopes[0])).not.toContain('落叶')

    // 未到期：读取被拒
    await expect(local.readLetter(envelopes[0]!.id)).rejects.toThrow('没有到开启时间')

    // 模拟到期：直接改存储中的 unlockAt 为过去
    const letters = JSON.parse(localStorage.getItem('leafstory:letters') ?? '{}') as Record<string, { unlockAt: string }>
    letters[envelopes[0]!.id]!.unlockAt = new Date(Date.now() - 1000).toISOString()
    localStorage.setItem('leafstory:letters', JSON.stringify(letters))

    // 到期后：收件人可读
    const content = await local.readLetter(envelopes[0]!.id)
    expect(content.title).toBe('一年后的我们')
    expect(content.body).toContain('落叶')
  })

  it('作者到期前可随时读自己的信；可撤回，撤回后收件人不可读', async () => {
    const { coupleId, aId } = await setupCouple()
    await local.signIn('a@x.com', PASSWORD) // 以作者身份写信
    const unlockAt = new Date(Date.now() + 3600_000).toISOString()
    await local.sealLetter(coupleId, aId, { recipient: 'partner', unlockAt, title: '悄悄话', body: '……' })
    const letterId = (await local.listLetters(coupleId))[0]!.id

    // 作者未到期也可读自己的
    const own = await local.readLetter(letterId)
    expect(own.title).toBe('悄悄话')

    // 撤回
    await local.revokeLetter(letterId)
    await local.signIn('b@x.com', PASSWORD)
    await expect(local.readLetter(letterId)).rejects.toThrow('撤回')

    // 封套状态更新
    const envelopes = await local.listLetters(coupleId)
    expect(envelopes[0]!.status).toBe('revoked')
  })

  it('到期后不能再撤回；过去的开启时间被拒绝', async () => {
    const { coupleId, aId } = await setupCouple()
    await local.signIn('a@x.com', PASSWORD) // 以作者身份操作
    // 过去的解锁时间：拒绝封存
    await expect(
      local.sealLetter(coupleId, aId, { recipient: 'both', unlockAt: new Date(Date.now() - 1000).toISOString(), title: 't', body: 'b' }),
    ).rejects.toThrow('未来')

    // 已到期的信不能撤回
    const unlockAt = new Date(Date.now() - 1000).toISOString()
    // 绕过校验直接构造一封已到期的信
    const letters = JSON.parse(localStorage.getItem('leafstory:letters') ?? '{}') as Record<string, unknown>
    const id = 'test-letter'
    letters[id] = {
      id,
      coupleId,
      authorId: aId,
      recipient: 'both',
      unlockAt,
      status: 'sealed',
      title: 't',
      body: 'b',
      createdAt: new Date(Date.now() - 2000).toISOString(),
      updatedAt: new Date(Date.now() - 2000).toISOString(),
    }
    localStorage.setItem('leafstory:letters', JSON.stringify(letters))
    await expect(local.revokeLetter(id)).rejects.toThrow('无法再撤回')
  })

  it('第三人完全不可见', async () => {
    const { coupleId, aId } = await setupCouple()
    await local.signIn('a@x.com', PASSWORD)
    await local.sealLetter(coupleId, aId, {
      recipient: 'both',
      unlockAt: new Date(Date.now() + 3600_000).toISOString(),
      title: 't',
      body: 'b',
    })
    const letterId = (await local.listLetters(coupleId))[0]!.id

    await local.signUp('c@x.com', PASSWORD, '路人')
    expect(await local.listLetters(coupleId)).toEqual([])
    await expect(local.readLetter(letterId)).rejects.toThrow()
    await expect(local.revokeLetter(letterId)).rejects.toThrow()
    await expect(local.deleteLetter(letterId)).rejects.toThrow()
  })
})
