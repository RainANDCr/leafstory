/**
 * 故事书本地模式测试：专题 CRUD、可见性联动（占位不泄露）、
 * 删除专题不影响原始日记、排序。
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

async function setupCoupleWithDiaries() {
  await local.signUp('a@x.com', PASSWORD, '猴子大王')
  const code = await local.createCoupleSpace('')
  const coupleId = (await local.getCoupleSnapshot(local.fetchSession().userId!)).info!.coupleId
  const aId = local.fetchSession().userId!

  const ids: string[] = []
  for (let i = 1; i <= 3; i++) {
    ids.push(
      await local.createDiary({
        coupleId,
        title: `旅行 ${i}`,
        content: `第 ${i} 天`,
        happenedOn: `2026-05-0${i}`,
        mood: 'date_trip',
        category: null,
        visibility: 'shared',
        status: 'published',
      }),
    )
  }
  return { coupleId, aId, code, ids }
}

describe('本地故事书（自定义专题）', () => {
  it('创建专题→按顺序装订→读取条目', async () => {
    const { coupleId, aId, ids } = await setupCoupleWithDiaries()
    const bookId = await local.createStoryBook(coupleId, aId, {
      title: '第一次旅行',
      intro: '三天的海边',
      coverMood: 'date_trip',
      entryIds: [ids[2]!, ids[0]!], // 自定义顺序
    })

    const books = await local.listStoryBooks(coupleId)
    expect(books).toHaveLength(1)
    expect(books[0]!.title).toBe('第一次旅行')

    const detail = await local.getStoryBook(bookId)
    expect(detail.entries.map((e) => e.id)).toEqual([ids[2]!, ids[0]!])
    expect(detail.missingEntryIds).toEqual([])
  })

  it('日记改为私密后：伴侣读取显示占位（missingEntryIds），不泄露内容', async () => {
    const { coupleId, aId, code, ids } = await setupCoupleWithDiaries()
    const bookId = await local.createStoryBook(coupleId, aId, {
      title: '我们的五月',
      intro: null,
      coverMood: 'joy',
      entryIds: ids,
    })

    // 作者把第一篇设为私密
    await local.updateDiary(ids[0]!, { visibility: 'private' })

    // 伴侣读取：私密篇进入占位列表，正文不可见
    await local.signUp('b@x.com', PASSWORD, '追落叶')
    await local.joinCouple(code)
    const detail = await local.getStoryBook(bookId)
    expect(detail.missingEntryIds).toEqual([ids[0]!])
    expect(detail.entries.map((e) => e.id)).toEqual([ids[1]!, ids[2]!])

    // 作者自己读仍是全量
    await local.signIn('a@x.com', PASSWORD)
    const mine = await local.getStoryBook(bookId)
    expect(mine.entries).toHaveLength(3)
  })

  it('删除专题不删除原始日记；更新专题可替换条目', async () => {
    const { coupleId, aId, ids } = await setupCoupleWithDiaries()
    const bookId = await local.createStoryBook(coupleId, aId, {
      title: '待整理',
      intro: null,
      coverMood: 'joy',
      entryIds: [ids[0]!],
    })

    await local.updateStoryBook(bookId, { title: '整理好了', intro: null, coverMood: 'joy', entryIds: [ids[1]!, ids[2]!] })
    const updated = await local.getStoryBook(bookId)
    expect(updated.book.title).toBe('整理好了')
    expect(updated.entries.map((e) => e.id)).toEqual([ids[1]!, ids[2]!])

    await local.deleteStoryBook(bookId)
    expect(await local.listStoryBooks(coupleId)).toEqual([])
    // 原始日记仍在
    const all = await local.listDiaries(0)
    expect(all.total).toBe(3)
  })

  it('reorderStoryBooks 调整顺序', async () => {
    const { coupleId, aId } = await setupCoupleWithDiaries()
    const id1 = await local.createStoryBook(coupleId, aId, { title: 'A', intro: null, coverMood: 'joy', entryIds: [] })
    const id2 = await local.createStoryBook(coupleId, aId, { title: 'B', intro: null, coverMood: 'joy', entryIds: [] })

    await local.reorderStoryBooks([id2, id1])
    const books = await local.listStoryBooks(coupleId)
    expect(books.map((b) => b.title)).toEqual(['B', 'A'])
  })
})
