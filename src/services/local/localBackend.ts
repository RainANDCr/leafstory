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
import type { Wish, WishInput, WishStatus } from '../wishService'
import type { LetterContent, LetterEnvelope, LetterInput } from '../letterService'
import type { Place, PlaceInput } from '../placeService'
import type { QuizSessionView } from '../quizService'
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

/** 调用者所属空间；未配对返回 null（列表类查询应返回空而不是抛错） */
function myCoupleIdOrNull(): string | null {
  const session = currentSession()
  if (!session) return null
  const mine = myMembership(session.userId)
  return mine?.coupleId ?? null
}

export async function listStoryBooks(coupleId: string): Promise<StoryBook[]> {
  if (myCoupleIdOrNull() !== coupleId) return []
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

// ------------------------------------------------------------ 心愿瓶

interface LocalWish {
  id: string
  coupleId: string
  title: string
  description: string | null
  createdBy: string
  dueDate: string | null
  priority: 'low' | 'normal' | 'high'
  status: WishStatus
  placeNote: string | null
  completedAt: string | null
  completedBy: string | null
  createdAt: string
  updatedAt: string
}

interface LocalWishEvent {
  id: string
  wishId: string
  actorId: string
  action: 'created' | 'status_changed' | 'edited'
  fromStatus: string | null
  toStatus: string | null
  createdAt: string
}

interface LocalWishLink {
  wishId: string
  diaryEntryId: string
  linkedBy: string
  createdAt: string
}

function toWish(row: LocalWish, links: LocalWishLink[]): Wish {
  const link = links.find((l) => l.wishId === row.id)
  return {
    id: row.id,
    coupleId: row.coupleId,
    title: row.title,
    description: row.description,
    createdBy: row.createdBy,
    dueDate: row.dueDate,
    priority: row.priority,
    status: row.status,
    placeNote: row.placeNote,
    completedAt: row.completedAt,
    completedBy: row.completedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    linkedDiaryId: link?.diaryEntryId ?? null,
  }
}

export async function listWishes(coupleId: string): Promise<Wish[]> {
  if (myCoupleIdOrNull() !== coupleId) return []
  const links = readJSON<LocalWishLink[]>(LS_KEYS.wishLinks, [])
  return Object.values(readJSON<Record<string, LocalWish>>(LS_KEYS.wishes, {}))
    .filter((r) => r.coupleId === coupleId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((r) => toWish(r, links))
}

function recordWishEvent(wishId: string, actorId: string, action: LocalWishEvent['action'], from: string | null, to: string | null): void {
  const events = readJSON<LocalWishEvent[]>(LS_KEYS.wishEvents, [])
  events.push({
    id: randomId(),
    wishId,
    actorId,
    action,
    fromStatus: from,
    toStatus: to,
    createdAt: new Date().toISOString(),
  })
  writeJSON(LS_KEYS.wishEvents, events)
}

export async function createWish(coupleId: string, userId: string, input: WishInput): Promise<void> {
  if (requireCoupleId() !== coupleId) throw new Error('无权写入这个双人空间')
  const wishes = readJSON<Record<string, LocalWish>>(LS_KEYS.wishes, {})
  const id = randomId()
  const now = new Date().toISOString()
  wishes[id] = {
    id,
    coupleId,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    createdBy: userId,
    dueDate: input.dueDate || null,
    priority: input.priority,
    status: 'wish',
    placeNote: input.placeNote?.trim() || null,
    completedAt: null,
    completedBy: null,
    createdAt: now,
    updatedAt: now,
  }
  writeJSON(LS_KEYS.wishes, wishes)
  recordWishEvent(id, userId, 'created', null, 'wish')
}

function requireWish(id: string): { wishes: Record<string, LocalWish>; row: LocalWish } {
  const coupleId = requireCoupleId()
  const wishes = readJSON<Record<string, LocalWish>>(LS_KEYS.wishes, {})
  const row = wishes[id]
  if (!row || row.coupleId !== coupleId) throw new Error('NOT_FOUND')
  return { wishes, row }
}

export async function updateWish(id: string, input: WishInput): Promise<void> {
  const { wishes, row } = requireWish(id)
  const userId = requireUserId()
  row.title = input.title.trim()
  row.description = input.description?.trim() || null
  row.dueDate = input.dueDate || null
  row.priority = input.priority
  row.placeNote = input.placeNote?.trim() || null
  row.updatedAt = new Date().toISOString()
  wishes[id] = row
  writeJSON(LS_KEYS.wishes, wishes)
  recordWishEvent(id, userId, 'edited', null, null)
}

export async function setWishStatus(id: string, to: WishStatus): Promise<void> {
  const { wishes, row } = requireWish(id)
  const userId = requireUserId()
  const from = row.status
  row.status = to
  if (to === 'done') {
    row.completedAt = new Date().toISOString()
    row.completedBy = userId
  } else {
    row.completedAt = null
    row.completedBy = null
  }
  row.updatedAt = new Date().toISOString()
  wishes[id] = row
  writeJSON(LS_KEYS.wishes, wishes)
  recordWishEvent(id, userId, 'status_changed', from, to)
}

export async function linkWishDiary(wishId: string, diaryEntryId: string | null, userId: string): Promise<void> {
  const { row } = requireWish(wishId)
  const links = readJSON<LocalWishLink[]>(LS_KEYS.wishLinks, []).filter((l) => l.wishId !== wishId)
  if (diaryEntryId) {
    // 只能关联自己空间里、且当前用户可见的日记
    const diaries = readJSON<Record<string, LocalDiary>>(LS_KEYS.diaries, {})
    const entry = diaries[diaryEntryId]
    if (!entry || entry.coupleId !== row.coupleId) throw new Error('NOT_FOUND')
    const currentUserId = requireUserId()
    if (!visibleTo(entry, currentUserId)) throw new Error('NOT_FOUND')
    links.push({ wishId, diaryEntryId, linkedBy: userId, createdAt: new Date().toISOString() })
  }
  writeJSON(LS_KEYS.wishLinks, links)
}

export async function deleteWish(id: string): Promise<void> {
  const { wishes } = requireWish(id)
  delete wishes[id]
  writeJSON(LS_KEYS.wishes, wishes)
  writeJSON(
    LS_KEYS.wishLinks,
    readJSON<LocalWishLink[]>(LS_KEYS.wishLinks, []).filter((l) => l.wishId !== id),
  )
  // 关联的日记保留不动
}

// ------------------------------------------------------------ 时光邮局

interface LocalLetter {
  id: string
  coupleId: string
  authorId: string
  recipient: 'partner' | 'both'
  unlockAt: string // UTC ISO
  status: 'sealed' | 'revoked'
  title: string
  body: string
  createdAt: string
  updatedAt: string
}

function toEnvelope(row: LocalLetter): LetterEnvelope {
  // 封套刻意不携带标题/正文
  return {
    id: row.id,
    coupleId: row.coupleId,
    authorId: row.authorId,
    recipient: row.recipient,
    unlockAt: row.unlockAt,
    status: row.status,
    createdAt: row.createdAt,
  }
}

export async function listLetters(coupleId: string): Promise<LetterEnvelope[]> {
  if (myCoupleIdOrNull() !== coupleId) return []
  return Object.values(readJSON<Record<string, LocalLetter>>(LS_KEYS.letters, {}))
    .filter((r) => r.coupleId === coupleId)
    .sort((a, b) => a.unlockAt.localeCompare(b.unlockAt))
    .map(toEnvelope)
}

export async function sealLetter(coupleId: string, userId: string, input: LetterInput): Promise<void> {
  if (requireCoupleId() !== coupleId) throw new Error('无权写入这个双人空间')
  const now = Date.now()
  if (new Date(input.unlockAt).getTime() <= now) throw new Error('开启时间要设在未来')
  const letters = readJSON<Record<string, LocalLetter>>(LS_KEYS.letters, {})
  const id = randomId()
  const nowISO = new Date().toISOString()
  letters[id] = {
    id,
    coupleId,
    authorId: userId,
    recipient: input.recipient,
    unlockAt: input.unlockAt,
    status: 'sealed',
    title: input.title.trim(),
    body: input.body,
    createdAt: nowISO,
    updatedAt: nowISO,
  }
  writeJSON(LS_KEYS.letters, letters)
}

/**
 * 读信（本地模式在服务层执行与云端 RPC 相同的校验）。
 * 注意：本地模式的数据本就在用户自己的设备上，规则保证的是
 * 「正常使用路径下的保密」，不是对抗本机用户的安全边界。
 */
export async function readLetter(letterId: string): Promise<LetterContent> {
  const coupleId = requireCoupleId()
  const userId = requireUserId()
  const row = readJSON<Record<string, LocalLetter>>(LS_KEYS.letters, {})[letterId]
  if (!row || row.coupleId !== coupleId) throw new Error('信件不存在')

  if (row.authorId !== userId) {
    if (row.status !== 'sealed') throw new Error('这封信已被寄件人撤回')
    if (Date.now() < new Date(row.unlockAt).getTime()) throw new Error('这封信还没有到开启时间')
  }

  return {
    id: row.id,
    authorId: row.authorId,
    recipient: row.recipient,
    unlockAt: row.unlockAt,
    status: row.status,
    title: row.title,
    body: row.body,
  }
}

export async function revokeLetter(letterId: string): Promise<void> {
  const coupleId = requireCoupleId()
  const userId = requireUserId()
  const letters = readJSON<Record<string, LocalLetter>>(LS_KEYS.letters, {})
  const row = letters[letterId]
  if (!row || row.coupleId !== coupleId) throw new Error('信件不存在')
  if (row.authorId !== userId) throw new Error('只有寄件人可以撤回')
  if (row.status !== 'sealed') throw new Error('这封信已经撤回过了')
  if (Date.now() >= new Date(row.unlockAt).getTime()) throw new Error('信件已经到达开启时间，无法再撤回')
  row.status = 'revoked'
  row.updatedAt = new Date().toISOString()
  letters[letterId] = row
  writeJSON(LS_KEYS.letters, letters)
}

export async function deleteLetter(letterId: string): Promise<void> {
  const coupleId = requireCoupleId()
  const userId = requireUserId()
  const letters = readJSON<Record<string, LocalLetter>>(LS_KEYS.letters, {})
  const row = letters[letterId]
  if (!row || row.coupleId !== coupleId || row.authorId !== userId) throw new Error('NOT_FOUND')
  delete letters[letterId]
  writeJSON(LS_KEYS.letters, letters)
}

// ------------------------------------------------------------ 地点足迹

interface LocalPlace {
  id: string
  coupleId: string
  name: string
  region: string | null
  note: string | null
  happenedOn: string | null
  latitude: number | null
  longitude: number | null
  isSpecial: boolean
  specialLabel: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface LocalPlaceLink {
  placeId: string
  diaryEntryId: string
  linkedBy: string
  createdAt: string
}

export async function listPlaces(coupleId: string): Promise<Place[]> {
  if (myCoupleIdOrNull() !== coupleId) return []
  const userId = requireUserId()
  const links = readJSON<LocalPlaceLink[]>(LS_KEYS.placeLinks, [])
  const diaries = readJSON<Record<string, LocalDiary>>(LS_KEYS.diaries, {})

  // 关联可见性跟随日记（镜像 RLS）：私密/草稿的关联只回给作者
  const byPlace = new Map<string, Array<{ id: string; title: string; happenedOn: string }>>()
  for (const link of links) {
    const entry = diaries[link.diaryEntryId]
    if (!entry || entry.coupleId !== coupleId || !visibleTo(entry, userId)) continue
    const list = byPlace.get(link.placeId) ?? []
    list.push({ id: entry.id, title: entry.title, happenedOn: entry.happenedOn })
    byPlace.set(link.placeId, list)
  }

  return Object.values(readJSON<Record<string, LocalPlace>>(LS_KEYS.places, {}))
    .filter((r) => r.coupleId === coupleId)
    .sort((a, b) => (b.happenedOn ?? '').localeCompare(a.happenedOn ?? ''))
    .map((r) => ({
      id: r.id,
      coupleId: r.coupleId,
      name: r.name,
      region: r.region,
      note: r.note,
      happenedOn: r.happenedOn,
      latitude: r.latitude,
      longitude: r.longitude,
      isSpecial: r.isSpecial,
      specialLabel: r.specialLabel,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      linkedDiaries: byPlace.get(r.id) ?? [],
    }))
}

function requirePlace(id: string): { places: Record<string, LocalPlace>; row: LocalPlace } {
  const coupleId = requireCoupleId()
  const places = readJSON<Record<string, LocalPlace>>(LS_KEYS.places, {})
  const row = places[id]
  if (!row || row.coupleId !== coupleId) throw new Error('NOT_FOUND')
  return { places, row }
}

function syncPlaceLinks(placeId: string, diaryIds: string[] | undefined, userId: string): void {
  if (!diaryIds) return
  const { row } = requirePlace(placeId)
  const diaries = readJSON<Record<string, LocalDiary>>(LS_KEYS.diaries, {})
  const currentUserId = requireUserId()

  // 先整体校验，全部通过才落盘——避免留下半成品
  for (const diaryId of diaryIds) {
    const entry = diaries[diaryId]
    if (!entry || entry.coupleId !== row.coupleId || !visibleTo(entry, currentUserId)) {
      throw new Error('NOT_FOUND')
    }
  }
  const links = readJSON<LocalPlaceLink[]>(LS_KEYS.placeLinks, []).filter((l) => l.placeId !== placeId)
  for (const diaryId of diaryIds) {
    links.push({ placeId, diaryEntryId: diaryId, linkedBy: userId, createdAt: new Date().toISOString() })
  }
  writeJSON(LS_KEYS.placeLinks, links)
}

export async function createPlace(coupleId: string, userId: string, input: PlaceInput): Promise<void> {
  if (requireCoupleId() !== coupleId) throw new Error('无权写入这个双人空间')
  const places = readJSON<Record<string, LocalPlace>>(LS_KEYS.places, {})
  const id = randomId()
  const now = new Date().toISOString()
  places[id] = {
    id,
    coupleId,
    name: input.name.trim(),
    region: input.region?.trim() || null,
    note: input.note?.trim() || null,
    happenedOn: input.happenedOn || null,
    latitude: input.latitude,
    longitude: input.longitude,
    isSpecial: input.isSpecial,
    specialLabel: input.isSpecial ? input.specialLabel?.trim() || null : null,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  }
  try {
    writeJSON(LS_KEYS.places, places)
    syncPlaceLinks(id, input.diaryIds, userId)
  } catch (err) {
    // 关联校验失败：回滚，不留半成品
    delete places[id]
    writeJSON(LS_KEYS.places, places)
    throw err
  }
}

export async function updatePlace(id: string, input: PlaceInput, userId: string): Promise<void> {
  const { places, row } = requirePlace(id)
  row.name = input.name.trim()
  row.region = input.region?.trim() || null
  row.note = input.note?.trim() || null
  row.happenedOn = input.happenedOn || null
  row.latitude = input.latitude
  row.longitude = input.longitude
  row.isSpecial = input.isSpecial
  row.specialLabel = input.isSpecial ? input.specialLabel?.trim() || null : null
  row.updatedAt = new Date().toISOString()
  places[id] = row
  writeJSON(LS_KEYS.places, places)
  syncPlaceLinks(id, input.diaryIds, userId)
}

export async function deletePlace(id: string): Promise<void> {
  const { places } = requirePlace(id)
  delete places[id]
  writeJSON(LS_KEYS.places, places)
  writeJSON(
    LS_KEYS.placeLinks,
    readJSON<LocalPlaceLink[]>(LS_KEYS.placeLinks, []).filter((l) => l.placeId !== id),
  )
}

// ------------------------------------------------------------ 默契小问答

interface LocalQuizSession {
  id: string
  coupleId: string
  questionId: string
  status: 'open' | 'revealed'
  startedBy: string
  endedEarlyBy: string | null
  createdAt: string
  updatedAt: string
}

interface LocalQuizAnswer {
  id: string
  sessionId: string
  authorId: string
  content: string
  emoji: string | null
  submitted: boolean
  submittedAt: string | null
  createdAt: string
  updatedAt: string
}

interface LocalQuizFavorite {
  id: string
  sessionId: string
  diaryEntryId: string
  createdBy: string
  createdAt: string
}

/**
 * 两阶段可见性（镜像 RLS）：对方的答案只有「对方已提交 且 我已提交」时可读；
 * 草稿永不可见（也探测不到存在）。
 */
export async function listQuizSessions(coupleId: string, myUserId: string, partnerUserId: string | null): Promise<QuizSessionView[]> {
  if (myCoupleIdOrNull() !== coupleId) return []
  const sessions = Object.values(readJSON<Record<string, LocalQuizSession>>(LS_KEYS.quizSessions, {}))
    .filter((s) => s.coupleId === coupleId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const answers = readJSON<LocalQuizAnswer[]>(LS_KEYS.quizAnswers, [])
  const favorites = readJSON<LocalQuizFavorite[]>(LS_KEYS.quizFavorites, [])
  const favoriteSet = new Set(favorites.map((f) => f.sessionId))

  return sessions.map((s) => {
    const mine = answers.find((a) => a.sessionId === s.id && a.authorId === myUserId)
    const partner = partnerUserId ? answers.find((a) => a.sessionId === s.id && a.authorId === partnerUserId) : undefined
    const partnerVisible = Boolean(partner?.submitted && mine?.submitted)
    return {
      id: s.id,
      questionId: s.questionId,
      status: s.status,
      startedBy: s.startedBy,
      endedEarlyBy: s.endedEarlyBy,
      createdAt: s.createdAt,
      myAnswer: mine
        ? { authorId: mine.authorId, content: mine.content, emoji: mine.emoji, submitted: mine.submitted, submittedAt: mine.submittedAt }
        : null,
      partnerAnswer: partnerVisible && partner
        ? { authorId: partner.authorId, content: partner.content, emoji: partner.emoji, submitted: partner.submitted, submittedAt: partner.submittedAt }
        : null,
      bothSubmitted: Boolean(mine?.submitted && partner?.submitted),
      isFavorite: favoriteSet.has(s.id),
    }
  })
}

export async function startQuizSession(coupleId: string, userId: string, questionId: string): Promise<void> {
  if (requireCoupleId() !== coupleId) throw new Error('无权写入这个双人空间')
  const sessions = readJSON<Record<string, LocalQuizSession>>(LS_KEYS.quizSessions, {})
  const id = randomId()
  const now = new Date().toISOString()
  sessions[id] = { id, coupleId, questionId, status: 'open', startedBy: userId, endedEarlyBy: null, createdAt: now, updatedAt: now }
  writeJSON(LS_KEYS.quizSessions, sessions)
}

export async function saveQuizAnswer(sessionId: string, input: { content: string; emoji: string | null; submit: boolean }): Promise<void> {
  const coupleId = requireCoupleId()
  const userId = requireUserId()
  const sessions = readJSON<Record<string, LocalQuizSession>>(LS_KEYS.quizSessions, {})
  const session = sessions[sessionId]
  if (!session || session.coupleId !== coupleId) throw new Error('NOT_FOUND')

  const answers = readJSON<LocalQuizAnswer[]>(LS_KEYS.quizAnswers, [])
  const mine = answers.find((a) => a.sessionId === sessionId && a.authorId === userId)
  const now = new Date().toISOString()
  if (mine) {
    mine.content = input.content
    mine.emoji = input.emoji
    mine.submitted = input.submit
    mine.submittedAt = input.submit ? now : null
    mine.updatedAt = now
  } else {
    answers.push({
      id: randomId(),
      sessionId,
      authorId: userId,
      content: input.content,
      emoji: input.emoji,
      submitted: input.submit,
      submittedAt: input.submit ? now : null,
      createdAt: now,
      updatedAt: now,
    })
  }
  writeJSON(LS_KEYS.quizAnswers, answers)

  if (input.submit) {
    const rows = answers.filter((a) => a.sessionId === sessionId)
    if (rows.length >= 2 && rows.every((r) => r.submitted)) {
      session.status = 'revealed'
      session.updatedAt = now
      sessions[sessionId] = session
      writeJSON(LS_KEYS.quizSessions, sessions)
    }
  }
}

export async function endQuizEarly(sessionId: string, userId: string): Promise<void> {
  const coupleId = requireCoupleId()
  const sessions = readJSON<Record<string, LocalQuizSession>>(LS_KEYS.quizSessions, {})
  const session = sessions[sessionId]
  if (!session || session.coupleId !== coupleId) throw new Error('NOT_FOUND')
  session.status = 'revealed'
  session.endedEarlyBy = userId
  session.updatedAt = new Date().toISOString()
  sessions[sessionId] = session
  writeJSON(LS_KEYS.quizSessions, sessions)
}

export async function skipQuizSession(sessionId: string): Promise<void> {
  const coupleId = requireCoupleId()
  const sessions = readJSON<Record<string, LocalQuizSession>>(LS_KEYS.quizSessions, {})
  const session = sessions[sessionId]
  if (!session || session.coupleId !== coupleId) throw new Error('NOT_FOUND')
  const answers = readJSON<LocalQuizAnswer[]>(LS_KEYS.quizAnswers, []).filter((a) => a.sessionId === sessionId)
  if (answers.some((a) => a.submitted)) {
    throw new Error('已有提交的答案，不能跳过；可以「提前结束」')
  }
  delete sessions[sessionId]
  writeJSON(LS_KEYS.quizSessions, sessions)
  writeJSON(
    LS_KEYS.quizAnswers,
    readJSON<LocalQuizAnswer[]>(LS_KEYS.quizAnswers, []).filter((a) => a.sessionId !== sessionId),
  )
}

export async function favoriteQuizToDiary(sessionId: string, diaryId: string, userId: string): Promise<void> {
  const coupleId = requireCoupleId()
  const sessions = readJSON<Record<string, LocalQuizSession>>(LS_KEYS.quizSessions, {})
  const session = sessions[sessionId]
  if (!session || session.coupleId !== coupleId) throw new Error('NOT_FOUND')
  const favorites = readJSON<LocalQuizFavorite[]>(LS_KEYS.quizFavorites, []).filter((f) => f.sessionId !== sessionId)
  favorites.push({ id: randomId(), sessionId, diaryEntryId: diaryId, createdBy: userId, createdAt: new Date().toISOString() })
  writeJSON(LS_KEYS.quizFavorites, favorites)
}

// ------------------------------------------------------------ 年度金叶（用户选择）与解除配对

export interface LocalGoldenLeaf {
  coupleId: string
  year: number
  title: string | null
  preciousDay: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export async function getGoldenLeaf(coupleId: string, year: number): Promise<LocalGoldenLeaf | null> {
  if (myCoupleIdOrNull() !== coupleId) return null
  return readJSON<Record<string, LocalGoldenLeaf>>(LS_KEYS.goldenLeaves, {})[`${coupleId}:${year}`] ?? null
}

export async function saveGoldenLeaf(
  coupleId: string,
  year: number,
  userId: string,
  patch: { title: string | null; preciousDay: string | null },
): Promise<void> {
  if (requireCoupleId() !== coupleId) throw new Error('无权写入这个双人空间')
  const leaves = readJSON<Record<string, LocalGoldenLeaf>>(LS_KEYS.goldenLeaves, {})
  const key = `${coupleId}:${year}`
  const now = new Date().toISOString()
  const existing = leaves[key]
  leaves[key] = {
    coupleId,
    year,
    title: patch.title,
    preciousDay: patch.preciousDay,
    createdBy: existing?.createdBy ?? userId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  writeJSON(LS_KEYS.goldenLeaves, leaves)
}

/** 解除配对：删除双方成员关系并作废邀请；共同数据保留但冻结（双方均不可见） */
export async function dissolveCouple(): Promise<void> {
  const userId = requireUserId()
  const mine = myMembership(userId)
  if (!mine) throw new Error('你还没有双人空间')

  const invitations = readJSON<LocalInvitation[]>(LS_KEYS.invitations, [])
  for (const inv of invitations) {
    if (inv.coupleId === mine.coupleId && !inv.usedAt) inv.usedAt = new Date().toISOString()
  }
  writeJSON(LS_KEYS.invitations, invitations)

  writeJSON(
    LS_KEYS.members,
    readJSON<LocalMember[]>(LS_KEYS.members, []).filter((m) => m.coupleId !== mine.coupleId),
  )
  notifySession()
}

/** 删除某作者的全部本地日记（含 IndexedDB 照片），返回数量 */
export async function deleteAllMyDiaries(userId: string): Promise<number> {
  let count = 0
  for (;;) {
    const page = await listDiaries(0, { authorId: userId })
    if (page.items.length === 0) break
    for (const entry of page.items) {
      await deleteDiary(entry.coupleId, entry.id)
      count += 1
    }
  }
  return count
}
