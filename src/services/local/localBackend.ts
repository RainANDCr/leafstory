/**
 * 本地模式后端：未配置 Supabase 时的完整数据实现。
 *
 * 设计原则：
 * - 与云端**同一套服务函数签名**，页面代码完全不变；
 * - 可见性规则**镜像数据库 RLS**：作者全量可见自己的（含草稿/私密），
 *   伴侣仅可见「双方可见且已发布」；无关用户一律不可见；
 * - 配对规则镜像 RPC：邀请码 24 小时、一次性、空间上限 2 人、一人一空间；
 * - 数据只存在这台设备：文字在 localStorage，照片在 IndexedDB；
 *   清除浏览器站点数据会一并清除，不假装云端持久化。
 */
import { LS_KEYS, readJSON, writeJSON } from './localDb'
import { deleteMedia, getMedia, putMedia } from './localMedia'
import { resizeImage } from '@/lib/image'
import type { Profile } from '../profileService'
import type { CoupleInfo, CoupleSnapshot } from '../coupleService'
import type { Anniversary, AnniversaryInput, AnniversaryKind } from '../anniversaryService'
import type { DiaryDetail, DiaryPage } from '../diaryService'
import type { StoryBook, StoryBookDetail, StoryBookInput } from '../storyService'
import type { DiaryEntry, DiaryFilter, DiaryInput, DiaryMedia } from '@/features/diary/types'

// ------------------------------------------------------------ 类型

interface LocalAccount {
  id: string
  email: string
  passwordHash: string
  createdAt: string
}

interface LocalProfile {
  id: string
  nickname: string
  avatarUrl: string | null
  timezone: string
  createdAt: string
  updatedAt: string
}

interface LocalCouple {
  id: string
  displayName: string | null
  createdAt: string
}

interface LocalMember {
  id: string
  coupleId: string
  userId: string
  role: 'founder' | 'member'
  joinedAt: string
}

interface LocalInvitation {
  id: string
  coupleId: string
  code: string
  expiresAt: string
  usedAt: string | null
  usedBy: string | null
  createdBy: string
  createdAt: string
}

interface LocalDiary {
  id: string
  coupleId: string
  authorId: string
  title: string
  content: string
  happenedOn: string
  mood: string
  category: string | null
  visibility: 'shared' | 'private'
  status: 'draft' | 'published'
  createdAt: string
  updatedAt: string
}

interface LocalMediaRow {
  id: string
  diaryEntryId: string
  storagePath: string // IndexedDB key
  fileName: string
  position: number
  createdAt: string
}

interface LocalAnniversary {
  id: string
  coupleId: string
  title: string
  kind: AnniversaryKind
  anniversaryDate: string
  repeatsYearly: boolean
  note: string | null
  linkedDiaryId: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

// ------------------------------------------------------------ 会话与错误

type Session = { userId: string } | null

function currentSession(): Session {
  return readJSON<Session>(LS_KEYS.session, null)
}

function setSession(s: Session): void {
  writeJSON(LS_KEYS.session, s)
  notifySession()
}

/** 与云端 authErrorMessage 的匹配规则保持一致，便于统一映射 */
function authFail(message: string): never {
  throw new Error(message)
}

async function sha256Hex(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  // 降级哈希：本地模式只是避免明文存密码，不是安全边界
  let h1 = 0x811c9dc5
  let h2 = 0x1000193
  for (let i = 0; i < text.length; i++) {
    h1 = Math.imul(h1 ^ text.charCodeAt(i), 0x01000193) >>> 0
    h2 = (h2 + text.charCodeAt(i) * (i + 7)) >>> 0
  }
  return `fnv${h1.toString(16)}${h2.toString(16)}`
}

/** 环境兼容的随机 ID（优先 UUID） */
function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

function requireUserId(): string {
  const s = currentSession()
  if (!s) authFail('Not logged in')
  return s.userId
}

// ------------------------------------------------------------ 认证

const sessionListeners = new Set<(s: { userId: string | null; email: string | null }) => void>()

function notifySession(): void {
  const s = fetchSession()
  for (const cb of sessionListeners) cb(s)
}

export function fetchSession(): { userId: string | null; email: string | null } {
  const s = currentSession()
  if (!s) return { userId: null, email: null }
  const accounts = readJSON<Record<string, LocalAccount>>(LS_KEYS.accounts, {})
  const account = Object.values(accounts).find((a) => a.id === s.userId)
  return { userId: s.userId, email: account?.email ?? null }
}

export function onSessionChange(cb: (s: { userId: string | null; email: string | null }) => void): () => void {
  sessionListeners.add(cb)
  return () => sessionListeners.delete(cb)
}

export async function signUp(email: string, password: string, nickname: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) authFail('Unable to validate email address')
  if (password.length < 6) authFail('Password should be at least 6 characters')

  const accounts = readJSON<Record<string, LocalAccount>>(LS_KEYS.accounts, {})
  if (Object.values(accounts).some((a) => a.email === normalized)) authFail('User already registered')

  const id = randomId()
  accounts[id] = {
    id,
    email: normalized,
    passwordHash: await sha256Hex(password),
    createdAt: new Date().toISOString(),
  }
  writeJSON(LS_KEYS.accounts, accounts)

  const profiles = readJSON<Record<string, LocalProfile>>(LS_KEYS.profiles, {})
  const now = new Date().toISOString()
  profiles[id] = {
    id,
    nickname: nickname.trim() || '旅人',
    avatarUrl: null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
    createdAt: now,
    updatedAt: now,
  }
  writeJSON(LS_KEYS.profiles, profiles)

  setSession({ userId: id })
  return true
}

export async function signIn(email: string, password: string): Promise<void> {
  const normalized = email.trim().toLowerCase()
  const accounts = readJSON<Record<string, LocalAccount>>(LS_KEYS.accounts, {})
  const account = Object.values(accounts).find((a) => a.email === normalized)
  if (!account || account.passwordHash !== (await sha256Hex(password))) {
    authFail('Invalid login credentials')
  }
  setSession({ userId: account.id })
}

export async function signOut(): Promise<void> {
  setSession(null)
}

export async function requestPasswordReset(): Promise<void> {
  authFail('Local mode does not support password reset')
}

// ------------------------------------------------------------ 档案

export async function getProfile(userId: string): Promise<Profile | null> {
  const profiles = readJSON<Record<string, LocalProfile>>(LS_KEYS.profiles, {})
  const p = profiles[userId]
  if (!p) return null
  return { id: p.id, nickname: p.nickname, avatarUrl: p.avatarUrl, timezone: p.timezone, createdAt: p.createdAt }
}

export async function updateProfile(userId: string, patch: { nickname?: string; timezone?: string }): Promise<void> {
  const profiles = readJSON<Record<string, LocalProfile>>(LS_KEYS.profiles, {})
  const p = profiles[userId]
  if (!p) throw new Error('档案不存在')
  if (patch.nickname !== undefined) p.nickname = patch.nickname.trim() || p.nickname
  if (patch.timezone !== undefined) p.timezone = patch.timezone
  p.updatedAt = new Date().toISOString()
  profiles[userId] = p
  writeJSON(LS_KEYS.profiles, profiles)
}

// ------------------------------------------------------------ 双人空间

function myMembership(userId: string): LocalMember | null {
  const members = readJSON<LocalMember[]>(LS_KEYS.members, [])
  return members.find((m) => m.userId === userId) ?? null
}

export async function getCoupleSnapshot(userId: string): Promise<CoupleSnapshot> {
  const mine = myMembership(userId)
  if (!mine) return { state: 'unpaired', info: null }

  const couples = readJSON<Record<string, LocalCouple>>(LS_KEYS.couples, {})
  const couple = couples[mine.coupleId]
  if (!couple) return { state: 'unpaired', info: null }

  const members = readJSON<LocalMember[]>(LS_KEYS.members, []).filter((m) => m.coupleId === couple.id)
  const profiles = readJSON<Record<string, LocalProfile>>(LS_KEYS.profiles, {})

  const info: CoupleInfo = {
    coupleId: couple.id,
    displayName: couple.displayName,
    createdAt: couple.createdAt,
    members: members.map((m) => ({
      userId: m.userId,
      nickname: profiles[m.userId]?.nickname ?? '旅人',
      role: m.role,
      joinedAt: m.joinedAt,
    })),
    myRole: mine.role,
  }
  return { state: info.members.length >= 2 ? 'paired' : 'waiting', info }
}

function randomCode(): string {
  // 从随机 ID 取 12 位十六进制，避免依赖 getRandomValues（jsdom 等环境可能缺失）
  return randomId()
    .replace(/[^0-9a-fA-F]/g, '')
    .slice(0, 12)
    .toUpperCase()
}

export async function createCoupleSpace(displayName: string): Promise<string> {
  const userId = requireUserId()
  if (myMembership(userId)) authFail('你已经属于一个双人空间')

  const coupleId = randomId()
  const couples = readJSON<Record<string, LocalCouple>>(LS_KEYS.couples, {})
  couples[coupleId] = { id: coupleId, displayName: displayName.trim() || null, createdAt: new Date().toISOString() }
  writeJSON(LS_KEYS.couples, couples)

  const members = readJSON<LocalMember[]>(LS_KEYS.members, [])
  members.push({ id: randomId(), coupleId, userId, role: 'founder', joinedAt: new Date().toISOString() })
  writeJSON(LS_KEYS.members, members)

  const code = randomCode()
  const invitations = readJSON<LocalInvitation[]>(LS_KEYS.invitations, [])
  invitations.push({
    id: randomId(),
    coupleId,
    code,
    expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
    usedAt: null,
    usedBy: null,
    createdBy: userId,
    createdAt: new Date().toISOString(),
  })
  writeJSON(LS_KEYS.invitations, invitations)
  return code
}

export async function regenerateInvitation(): Promise<{ code: string; expiresAt: string }> {
  const userId = requireUserId()
  const mine = myMembership(userId)
  if (!mine) authFail('你还没有双人空间')
  const members = readJSON<LocalMember[]>(LS_KEYS.members, [])
  if (members.filter((m) => m.coupleId === mine.coupleId).length >= 2) authFail('空间成员已满，无需邀请')

  const invitations = readJSON<LocalInvitation[]>(LS_KEYS.invitations, [])
  const now = new Date().toISOString()
  for (const inv of invitations) {
    if (inv.coupleId === mine.coupleId && !inv.usedAt) inv.usedAt = now
  }
  const code = randomCode()
  const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString()
  invitations.push({
    id: randomId(),
    coupleId: mine.coupleId,
    code,
    expiresAt,
    usedAt: null,
    usedBy: null,
    createdBy: userId,
    createdAt: now,
  })
  writeJSON(LS_KEYS.invitations, invitations)
  return { code, expiresAt }
}

export async function getPendingInvitation(): Promise<{ expiresAt: string } | null> {
  const userId = requireUserId()
  const mine = myMembership(userId)
  if (!mine) return null
  const members = readJSON<LocalMember[]>(LS_KEYS.members, [])
  if (members.filter((m) => m.coupleId === mine.coupleId).length >= 2) return null

  const invitations = readJSON<LocalInvitation[]>(LS_KEYS.invitations, [])
  const pending = invitations
    .filter((i) => i.coupleId === mine.coupleId && !i.usedAt && new Date(i.expiresAt).getTime() > Date.now())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return pending[0] ? { expiresAt: pending[0].expiresAt } : null
}

export async function joinCouple(code: string): Promise<string> {
  const userId = requireUserId()
  if (myMembership(userId)) authFail('你已经属于一个双人空间，无法再加入')

  const normalized = code.trim().toUpperCase()
  const invitations = readJSON<LocalInvitation[]>(LS_KEYS.invitations, [])
  const invite = invitations
    .filter((i) => i.code === normalized && !i.usedAt && new Date(i.expiresAt).getTime() > Date.now())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  if (!invite) authFail('邀请码无效或已过期')

  const members = readJSON<LocalMember[]>(LS_KEYS.members, [])
  if (members.filter((m) => m.coupleId === invite.coupleId).length >= 2) {
    authFail('这个空间已经有两位成员了')
  }

  members.push({ id: randomId(), coupleId: invite.coupleId, userId, role: 'member', joinedAt: new Date().toISOString() })
  writeJSON(LS_KEYS.members, members)

  invite.usedAt = new Date().toISOString()
  invite.usedBy = userId
  writeJSON(LS_KEYS.invitations, invitations)
  return invite.coupleId
}

// ------------------------------------------------------------ 日记

const PAGE_SIZE = 10

function toEntry(row: LocalDiary, mediaCount = 0): DiaryEntry {
  return {
    id: row.id,
    coupleId: row.coupleId,
    authorId: row.authorId,
    title: row.title,
    content: row.content,
    happenedOn: row.happenedOn,
    mood: row.mood,
    category: row.category,
    visibility: row.visibility,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    mediaCount,
  }
}

function mediaRows(entryId: string): LocalMediaRow[] {
  const rows = readJSON<LocalMediaRow[]>(LS_KEYS.diaryMedia, [])
  return rows.filter((r) => r.diaryEntryId === entryId).sort((a, b) => a.position - b.position)
}

/** 镜像 RLS：作者全量可见自己的；伴侣仅可见共享已发布；他人不可见 */
function visibleTo(row: LocalDiary, userId: string): boolean {
  if (row.authorId === userId) return true
  if (row.visibility !== 'shared' || row.status !== 'published') return false
  const mine = myMembership(userId)
  return Boolean(mine && mine.coupleId === row.coupleId)
}

export async function listDiaries(page: number, filter: DiaryFilter = {}): Promise<DiaryPage> {
  const userId = requireUserId()
  const all = Object.values(readJSON<Record<string, LocalDiary>>(LS_KEYS.diaries, {}))
    .filter((row) => visibleTo(row, userId))
    .filter((row) => (filter.mood ? row.mood === filter.mood : true))
    .filter((row) => (filter.authorId ? row.authorId === filter.authorId : true))

  const kw = filter.search?.trim().toLowerCase()
  const searched = kw
    ? all.filter((r) => r.title.toLowerCase().includes(kw) || r.content.toLowerCase().includes(kw))
    : all

  searched.sort((a, b) =>
    b.happenedOn.localeCompare(a.happenedOn) || b.createdAt.localeCompare(a.createdAt),
  )

  const total = searched.length
  const items = searched.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE).map((row) => {
    const rows = readJSON<LocalMediaRow[]>(LS_KEYS.diaryMedia, [])
    return toEntry(row, rows.filter((r) => r.diaryEntryId === row.id).length)
  })
  return { items, total, hasMore: (page + 1) * PAGE_SIZE < total }
}

export async function listSharedDiariesForTree(limit = 200): Promise<DiaryEntry[]> {
  const userId = requireUserId()
  const mine = myMembership(userId)
  if (!mine) return []
  const all = Object.values(readJSON<Record<string, LocalDiary>>(LS_KEYS.diaries, {}))
    .filter((row) => row.coupleId === mine.coupleId && row.visibility === 'shared' && row.status === 'published')
    .sort((a, b) => b.happenedOn.localeCompare(a.happenedOn) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
  const rows = readJSON<LocalMediaRow[]>(LS_KEYS.diaryMedia, [])
  return all.map((row) => toEntry(row, rows.filter((r) => r.diaryEntryId === row.id).length))
}

/** 故事书数据源：当前用户可见的全部日记（按发生日期倒序，限量） */
export async function listVisibleDiariesForStory(limit = 500): Promise<DiaryEntry[]> {
  const userId = requireUserId()
  const all = Object.values(readJSON<Record<string, LocalDiary>>(LS_KEYS.diaries, {}))
    .filter((row) => visibleTo(row, userId))
    .sort((a, b) => b.happenedOn.localeCompare(a.happenedOn) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
  const rows = readJSON<LocalMediaRow[]>(LS_KEYS.diaryMedia, [])
  return all.map((row) => toEntry(row, rows.filter((r) => r.diaryEntryId === row.id).length))
}

export async function getDiaryDetail(id: string): Promise<DiaryDetail> {
  const userId = requireUserId()
  const row = readJSON<Record<string, LocalDiary>>(LS_KEYS.diaries, {})[id]
  if (!row || !visibleTo(row, userId)) throw new Error('NOT_FOUND')

  const media: DiaryMedia[] = mediaRows(id).map((r) => ({
    id: r.id,
    diaryEntryId: r.diaryEntryId,
    storagePath: r.storagePath,
    fileName: r.fileName,
    position: r.position,
  }))
  const mediaUrls = await Promise.all(
    media.map(async (m) => {
      const blob = await getMedia(m.storagePath)
      if (!blob) throw new Error('照片数据缺失')
      return URL.createObjectURL(blob)
    }),
  )
  return { entry: toEntry(row, media.length), media, mediaUrls }
}

export async function createDiary(input: DiaryInput): Promise<string> {
  const userId = requireUserId()
  const mine = myMembership(userId)
  if (!mine || mine.coupleId !== input.coupleId) throw new Error('无权写入这个双人空间')

  const id = randomId()
  const now = new Date().toISOString()
  const diaries = readJSON<Record<string, LocalDiary>>(LS_KEYS.diaries, {})
  diaries[id] = {
    id,
    coupleId: input.coupleId,
    authorId: userId,
    title: input.title.trim(),
    content: input.content,
    happenedOn: input.happenedOn,
    mood: input.mood,
    category: input.category?.trim() || null,
    visibility: input.visibility,
    status: input.status,
    createdAt: now,
    updatedAt: now,
  }
  writeJSON(LS_KEYS.diaries, diaries)
  return id
}

export async function updateDiary(
  id: string,
  patch: Partial<Pick<DiaryInput, 'title' | 'content' | 'happenedOn' | 'mood' | 'category' | 'visibility' | 'status'>>,
): Promise<void> {
  const userId = requireUserId()
  const diaries = readJSON<Record<string, LocalDiary>>(LS_KEYS.diaries, {})
  const row = diaries[id]
  if (!row || row.authorId !== userId) throw new Error('NOT_FOUND')
  if (patch.title !== undefined) row.title = patch.title.trim()
  if (patch.content !== undefined) row.content = patch.content
  if (patch.happenedOn !== undefined) row.happenedOn = patch.happenedOn
  if (patch.mood !== undefined) row.mood = patch.mood as string
  if (patch.category !== undefined) row.category = patch.category
  if (patch.visibility !== undefined) row.visibility = patch.visibility
  if (patch.status !== undefined) row.status = patch.status
  row.updatedAt = new Date().toISOString()
  diaries[id] = row
  writeJSON(LS_KEYS.diaries, diaries)
}

export async function deleteDiary(_coupleId: string, entryId: string): Promise<void> {
  const userId = requireUserId()
  const diaries = readJSON<Record<string, LocalDiary>>(LS_KEYS.diaries, {})
  const row = diaries[entryId]
  if (!row || row.authorId !== userId) throw new Error('NOT_FOUND')

  const rows = readJSON<LocalMediaRow[]>(LS_KEYS.diaryMedia, [])
  const removed = rows.filter((r) => r.diaryEntryId === entryId)
  for (const r of removed) await deleteMedia(r.storagePath)
  writeJSON(LS_KEYS.diaryMedia, rows.filter((r) => r.diaryEntryId !== entryId))

  delete diaries[entryId]
  writeJSON(LS_KEYS.diaries, diaries)
}

export async function uploadDiaryMedia(
  _userId: string,
  _coupleId: string,
  entryId: string,
  files: File[],
  startPosition: number,
): Promise<string[]> {
  const userId = requireUserId()
  const row = readJSON<Record<string, LocalDiary>>(LS_KEYS.diaries, {})[entryId]
  if (!row || row.authorId !== userId) throw new Error('NOT_FOUND')

  const failed: string[] = []
  const rows = readJSON<LocalMediaRow[]>(LS_KEYS.diaryMedia, [])
  let position = startPosition
  for (const file of files) {
    try {
      const blob = await resizeImage(file)
      const key = randomId()
      await putMedia(key, blob)
      rows.push({
        id: randomId(),
        diaryEntryId: entryId,
        storagePath: key,
        fileName: file.name,
        position: position++,
        createdAt: new Date().toISOString(),
      })
    } catch {
      failed.push(file.name)
    }
  }
  writeJSON(LS_KEYS.diaryMedia, rows)
  return failed
}

export async function removeDiaryMedia(media: DiaryMedia): Promise<void> {
  const userId = requireUserId()
  const row = readJSON<Record<string, LocalDiary>>(LS_KEYS.diaries, {})[media.diaryEntryId]
  if (!row || row.authorId !== userId) throw new Error('NOT_FOUND')
  const rows = readJSON<LocalMediaRow[]>(LS_KEYS.diaryMedia, [])
  writeJSON(LS_KEYS.diaryMedia, rows.filter((r) => r.id !== media.id))
  await deleteMedia(media.storagePath)
}

export async function createMediaSignedUrl(path: string): Promise<string> {
  const blob = await getMedia(path)
  if (!blob) throw new Error('照片数据缺失')
  return URL.createObjectURL(blob)
}

// ------------------------------------------------------------ 纪念日

function toAnniversary(row: LocalAnniversary): Anniversary {
  return {
    id: row.id,
    coupleId: row.coupleId,
    title: row.title,
    kind: row.kind,
    anniversaryDate: row.anniversaryDate,
    repeatsYearly: row.repeatsYearly,
    note: row.note,
    linkedDiaryId: row.linkedDiaryId,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  }
}

export async function listAnniversaries(coupleId: string): Promise<Anniversary[]> {
  const userId = requireUserId()
  const mine = myMembership(userId)
  if (!mine || mine.coupleId !== coupleId) return []
  return Object.values(readJSON<Record<string, LocalAnniversary>>(LS_KEYS.anniversaries, {}))
    .filter((r) => r.coupleId === coupleId)
    .sort((a, b) => a.anniversaryDate.localeCompare(b.anniversaryDate))
    .map(toAnniversary)
}

export async function createAnniversary(coupleId: string, userId: string, input: AnniversaryInput): Promise<void> {
  const mine = myMembership(userId)
  if (!mine || mine.coupleId !== coupleId) throw new Error('无权写入这个双人空间')
  const now = new Date().toISOString()
  const rows = readJSON<Record<string, LocalAnniversary>>(LS_KEYS.anniversaries, {})
  const id = randomId()
  rows[id] = {
    id,
    coupleId,
    title: input.title.trim(),
    kind: input.kind,
    anniversaryDate: input.anniversaryDate,
    repeatsYearly: input.repeatsYearly,
    note: input.note?.trim() || null,
    linkedDiaryId: null,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  }
  writeJSON(LS_KEYS.anniversaries, rows)
}

export async function updateAnniversary(id: string, input: AnniversaryInput): Promise<void> {
  const userId = requireUserId()
  const rows = readJSON<Record<string, LocalAnniversary>>(LS_KEYS.anniversaries, {})
  const row = rows[id]
  const mine = myMembership(userId)
  if (!row || !mine || row.coupleId !== mine.coupleId) throw new Error('NOT_FOUND')
  row.title = input.title.trim()
  row.kind = input.kind
  row.anniversaryDate = input.anniversaryDate
  row.repeatsYearly = input.repeatsYearly
  row.note = input.note?.trim() || null
  row.updatedAt = new Date().toISOString()
  rows[id] = row
  writeJSON(LS_KEYS.anniversaries, rows)
}

export async function deleteAnniversary(id: string): Promise<void> {
  const userId = requireUserId()
  const rows = readJSON<Record<string, LocalAnniversary>>(LS_KEYS.anniversaries, {})
  const row = rows[id]
  const mine = myMembership(userId)
  if (!row || !mine || row.coupleId !== mine.coupleId) throw new Error('NOT_FOUND')
  delete rows[id]
  writeJSON(LS_KEYS.anniversaries, rows)
}

// ------------------------------------------------------------ 故事书（自定义专题）

interface LocalStoryBook {
  id: string
  coupleId: string
  title: string
  intro: string | null
  coverMood: string | null
  position: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface LocalStoryItem {
  id: string
  bookId: string
  entryId: string
  position: number
  createdAt: string
}

function toStoryBook(row: LocalStoryBook): StoryBook {
  return {
    id: row.id,
    coupleId: row.coupleId,
    title: row.title,
    intro: row.intro,
    coverMood: row.coverMood,
    position: row.position,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function requireCoupleId(): string {
  const mine = myMembership(requireUserId())
  if (!mine) throw new Error('NOT_FOUND')
  return mine.coupleId
}

export async function listStoryBooks(coupleId: string): Promise<StoryBook[]> {
  if (requireCoupleId() !== coupleId) return []
  return Object.values(readJSON<Record<string, LocalStoryBook>>(LS_KEYS.storyBooks, {}))
    .filter((r) => r.coupleId === coupleId)
    .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt))
    .map(toStoryBook)
}

export async function getStoryBook(id: string): Promise<StoryBookDetail> {
  const coupleId = requireCoupleId()
  const books = readJSON<Record<string, LocalStoryBook>>(LS_KEYS.storyBooks, {})
  const row = books[id]
  if (!row || row.coupleId !== coupleId) throw new Error('NOT_FOUND')

  const items = readJSON<LocalStoryItem[]>(LS_KEYS.storyItems, [])
    .filter((i) => i.bookId === id)
    .sort((a, b) => a.position - b.position)
    .map((i) => ({ entryId: i.entryId, position: i.position }))

  const diaries = readJSON<Record<string, LocalDiary>>(LS_KEYS.diaries, {})
  const mediaRows = readJSON<LocalMediaRow[]>(LS_KEYS.diaryMedia, [])
  const userId = requireUserId()
  const entries: DiaryEntry[] = []
  const missingEntryIds: string[] = []
  for (const item of items) {
    const d = diaries[item.entryId]
    if (d && visibleTo(d, userId)) {
      entries.push(toEntry(d, mediaRows.filter((r) => r.diaryEntryId === d.id).length))
    } else {
      missingEntryIds.push(item.entryId)
    }
  }
  return { book: toStoryBook(row), items, entries, missingEntryIds }
}

export async function createStoryBook(coupleId: string, userId: string, input: StoryBookInput): Promise<string> {
  if (requireCoupleId() !== coupleId) throw new Error('无权写入这个双人空间')
  const books = readJSON<Record<string, LocalStoryBook>>(LS_KEYS.storyBooks, {})
  const position = Object.values(books).filter((b) => b.coupleId === coupleId).length
  const id = randomId()
  const now = new Date().toISOString()
  books[id] = {
    id,
    coupleId,
    title: input.title.trim(),
    intro: input.intro?.trim() || null,
    coverMood: input.coverMood,
    position,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  }
  writeJSON(LS_KEYS.storyBooks, books)
  writeStoryItems(id, input.entryIds ?? [])
  return id
}

function writeStoryItems(bookId: string, entryIds: string[]): void {
  const items = readJSON<LocalStoryItem[]>(LS_KEYS.storyItems, []).filter((i) => i.bookId !== bookId)
  const now = new Date().toISOString()
  entryIds.forEach((entryId, index) => {
    items.push({ id: randomId(), bookId, entryId, position: index, createdAt: now })
  })
  writeJSON(LS_KEYS.storyItems, items)
}

export async function updateStoryBook(id: string, input: StoryBookInput): Promise<void> {
  const coupleId = requireCoupleId()
  const books = readJSON<Record<string, LocalStoryBook>>(LS_KEYS.storyBooks, {})
  const row = books[id]
  if (!row || row.coupleId !== coupleId) throw new Error('NOT_FOUND')
  row.title = input.title.trim()
  row.intro = input.intro?.trim() || null
  row.coverMood = input.coverMood
  row.updatedAt = new Date().toISOString()
  books[id] = row
  writeJSON(LS_KEYS.storyBooks, books)
  if (input.entryIds) writeStoryItems(id, input.entryIds)
}

export async function deleteStoryBook(id: string): Promise<void> {
  const coupleId = requireCoupleId()
  const books = readJSON<Record<string, LocalStoryBook>>(LS_KEYS.storyBooks, {})
  const row = books[id]
  if (!row || row.coupleId !== coupleId) throw new Error('NOT_FOUND')
  delete books[id]
  writeJSON(LS_KEYS.storyBooks, books)
  writeJSON(
    LS_KEYS.storyItems,
    readJSON<LocalStoryItem[]>(LS_KEYS.storyItems, []).filter((i) => i.bookId !== id),
  )
}

export async function reorderStoryBooks(ids: string[]): Promise<void> {
  const coupleId = requireCoupleId()
  const books = readJSON<Record<string, LocalStoryBook>>(LS_KEYS.storyBooks, {})
  ids.forEach((id, index) => {
    const row = books[id]
    if (row && row.coupleId === coupleId) row.position = index
  })
  writeJSON(LS_KEYS.storyBooks, books)
}
