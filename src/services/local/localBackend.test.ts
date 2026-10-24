/**
 * 本地模式规则测试：验证本地实现镜像了云端 RLS / RPC 的关键约束。
 * 覆盖：认证、配对（一次性邀请码、过期、上限 2 人）、
 * 日记可见性（伴侣只见共享已发布、他人不可见、仅作者可改删）、纪念日隔离。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as local from './localBackend'
import { LS_KEYS, readJSON, writeJSON } from './localDb'

const PASSWORD = 'leaf-story-123'

async function register(email: string, nickname: string): Promise<void> {
  await local.signUp(email, PASSWORD, nickname)
}

async function loginAs(email: string): Promise<void> {
  await local.signIn(email, PASSWORD)
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('本地认证', () => {
  it('注册即登录，会话可查', async () => {
    const direct = await local.signUp('a@x.com', PASSWORD, '小猴')
    expect(direct).toBe(true)
    const s = local.fetchSession()
    expect(s.userId).toBeTruthy()
    expect(s.email).toBe('a@x.com')
  })

  it('重复邮箱与弱密码被拒绝', async () => {
    await register('a@x.com', '小猴')
    await expect(local.signUp('a@x.com', PASSWORD, '又一个')).rejects.toThrow('User already registered')
    await expect(local.signUp('b@x.com', '123', '弱密码')).rejects.toThrow('Password should be at least')
  })

  it('错误密码登录失败；退出后会话清空', async () => {
    await register('a@x.com', '小猴')
    await local.signOut()
    expect(local.fetchSession().userId).toBeNull()
    await expect(local.signIn('a@x.com', 'wrong-pass')).rejects.toThrow('Invalid login credentials')
    await local.signIn('a@x.com', PASSWORD)
    expect(local.fetchSession().userId).toBeTruthy()
  })
})

describe('本地配对（镜像 RPC 约束）', () => {
  it('创建空间→凭码加入→双方已配对；邀请码一次性', async () => {
    await register('a@x.com', '猴子大王')
    const code = await local.createCoupleSpace('我们的树洞')
    expect(code).toMatch(/^[0-9A-F]{12}$/)

    const mine = await local.getCoupleSnapshot(local.fetchSession().userId!)
    expect(mine.state).toBe('waiting')
    expect(mine.info?.myRole).toBe('founder')

    await register('b@x.com', '追落叶')
    const coupleId = await local.joinCouple(code)
    expect(coupleId).toBe(mine.info?.coupleId)

    const hers = await local.getCoupleSnapshot(local.fetchSession().userId!)
    expect(hers.state).toBe('paired')
    expect(hers.info?.members).toHaveLength(2)

    // 邀请码已被使用：第三人再用同一码失败
    await register('c@x.com', '路人')
    await expect(local.joinCouple(code)).rejects.toThrow('邀请码无效或已过期')
  })

  it('过期邀请码被拒绝', async () => {
    await register('a@x.com', '猴子大王')
    const code = await local.createCoupleSpace('')

    // 直接把邀请改为已过期
    const invitations = readJSON<Array<{ code: string; expiresAt: string }>>(LS_KEYS.invitations, [])
    for (const inv of invitations) {
      if (inv.code === code) inv.expiresAt = new Date(Date.now() - 1000).toISOString()
    }
    writeJSON(LS_KEYS.invitations, invitations)

    await register('b@x.com', '追落叶')
    await expect(local.joinCouple(code)).rejects.toThrow('邀请码无效或已过期')
  })

  it('空间满 2 人后无法再加第三人（即使持有有效码）', async () => {
    await register('a@x.com', '猴子大王')
    const code = await local.createCoupleSpace('')
    const coupleId = (await local.getCoupleSnapshot(local.fetchSession().userId!)).info!.coupleId

    await register('b@x.com', '追落叶')
    await local.joinCouple(code)

    // 伪造一张该空间的有效新邀请（模拟并发场景）
    const invitations = readJSON<Array<{ id: string; coupleId: string; code: string; expiresAt: string; usedAt: string | null; usedBy: string | null; createdBy: string; createdAt: string }>>(LS_KEYS.invitations, [])
    invitations.push({
      id: 'test-invite',
      coupleId,
      code: 'AABBCCDDEEFF',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      usedAt: null,
      usedBy: null,
      createdBy: 'x',
      createdAt: new Date().toISOString(),
    })
    writeJSON(LS_KEYS.invitations, invitations)

    await register('c@x.com', '路人')
    await expect(local.joinCouple('AABBCCDDEEFF')).rejects.toThrow('两位成员')
    // 已在空间中的用户不能再加入别的空间
    await loginAs('b@x.com')
    const codeB = await local.createCoupleSpace('').catch(() => null)
    expect(codeB).toBeNull()
  })
})

describe('本地日记可见性（镜像 RLS）', () => {
  async function setupCouple() {
    await register('a@x.com', '猴子大王')
    const code = await local.createCoupleSpace('')
    const coupleId = (await local.getCoupleSnapshot(local.fetchSession().userId!)).info!.coupleId
    await register('b@x.com', '追落叶')
    await local.joinCouple(code)
    return coupleId
  }

  async function seedDiaries(coupleId: string) {
    const base = { coupleId, title: '', content: '', happenedOn: '2026-10-24', mood: 'joy' as const, category: null }
    await loginAs('a@x.com')
    const sharedId = await local.createDiary({ ...base, title: '一起看海', content: '浪很大', visibility: 'shared', status: 'published' })
    const privateId = await local.createDiary({ ...base, title: '悄悄话', content: '只给自己看', visibility: 'private', status: 'published' })
    const draftId = await local.createDiary({ ...base, title: '还没写完', content: '草稿', visibility: 'shared', status: 'draft' })
    return { sharedId, privateId, draftId }
  }

  it('作者可见全部；伴侣仅见共享已发布；陌生人什么都看不见', async () => {
    const coupleId = await setupCouple()
    const { sharedId, privateId, draftId } = await seedDiaries(coupleId)

    // 作者：3 篇全见
    const mine = await local.listDiaries(0)
    expect(mine.total).toBe(3)

    // 伴侣：只见共享已发布
    await loginAs('b@x.com')
    const hers = await local.listDiaries(0)
    expect(hers.total).toBe(1)
    expect(hers.items[0]!.id).toBe(sharedId)
    expect(await local.getDiaryDetail(sharedId)).toBeTruthy()
    await expect(local.getDiaryDetail(privateId)).rejects.toThrow('NOT_FOUND')
    await expect(local.getDiaryDetail(draftId)).rejects.toThrow('NOT_FOUND')

    // 回忆树数据源同样只见共享
    const tree = await local.listSharedDiariesForTree()
    expect(tree).toHaveLength(1)
    expect(tree[0]!.id).toBe(sharedId)

    // 陌生人：0
    await register('c@x.com', '路人')
    expect((await local.listDiaries(0)).total).toBe(0)
    await expect(local.getDiaryDetail(sharedId)).rejects.toThrow('NOT_FOUND')
  })

  it('仅作者可改删自己的日记', async () => {
    const coupleId = await setupCouple()
    const { sharedId } = await seedDiaries(coupleId)

    await loginAs('b@x.com')
    await expect(local.updateDiary(sharedId, { title: '偷改' })).rejects.toThrow('NOT_FOUND')
    await expect(local.deleteDiary(coupleId, sharedId)).rejects.toThrow('NOT_FOUND')

    await loginAs('a@x.com')
    await local.updateDiary(sharedId, { title: '一起看海（改）' })
    const detail = await local.getDiaryDetail(sharedId)
    expect(detail.entry.title).toBe('一起看海（改）')
  })

  it('搜索与分页', async () => {
    const coupleId = await setupCouple()
    await loginAs('a@x.com')
    for (let i = 1; i <= 12; i++) {
      await local.createDiary({
        coupleId,
        title: `散步 ${i} 号`,
        content: '今天走了很多路',
        happenedOn: `2026-10-${String(i).padStart(2, '0')}`,
        mood: 'joy',
        category: null,
        visibility: 'shared',
        status: 'published',
      })
    }

    const page0 = await local.listDiaries(0)
    expect(page0.total).toBe(12)
    expect(page0.items).toHaveLength(10)
    expect(page0.hasMore).toBe(true)
    const page1 = await local.listDiaries(1)
    expect(page1.items).toHaveLength(2)
    expect(page1.hasMore).toBe(false)
    // 按发生日期倒序
    expect(page0.items[0]!.happenedOn).toBe('2026-10-12')

    const searched = await local.listDiaries(0, { search: '散步 3' })
    expect(searched.total).toBe(1)
  })
})

describe('本地纪念日', () => {
  it('双人空间内共享，陌生人不可见不可删', async () => {
    await register('a@x.com', '猴子大王')
    const code = await local.createCoupleSpace('')
    const coupleId = (await local.getCoupleSnapshot(local.fetchSession().userId!)).info!.coupleId
    const aId = local.fetchSession().userId!

    await local.createAnniversary(coupleId, aId, {
      title: '在一起',
      kind: 'together',
      anniversaryDate: '2024-05-20',
      repeatsYearly: true,
      note: null,
    })

    // 伴侣可见且可改
    await register('b@x.com', '追落叶')
    await local.joinCouple(code)
    const list = await local.listAnniversaries(coupleId)
    expect(list).toHaveLength(1)
    expect(list[0]!.kind).toBe('together')
    await local.updateAnniversary(list[0]!.id, { ...list[0]!, title: '在一起五二零' })

    // 陌生人：空列表，无法删除
    await register('c@x.com', '路人')
    expect(await local.listAnniversaries(coupleId)).toEqual([])
    await expect(local.deleteAnniversary(list[0]!.id)).rejects.toThrow('NOT_FOUND')
  })
})
