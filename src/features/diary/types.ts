/**
 * 日记领域类型与心情→叶子颜色映射。
 * 颜色由用户手选，禁止由 AI 或系统推测。
 */
import { zhCN } from '@/i18n'

export type Mood = 'joy' | 'date_trip' | 'memorial' | 'new_start' | 'heartbeat' | 'growth'
export type Visibility = 'shared' | 'private'
export type DiaryStatus = 'draft' | 'published'

export const MOODS: ReadonlyArray<{ key: Mood; label: string; color: string }> = [
  { key: 'joy', label: zhCN.moods.joy, color: '#C99D4A' }, // 金色 · 快乐
  { key: 'date_trip', label: zhCN.moods.dateTrip, color: '#D89A5B' }, // 橙色 · 约会旅行
  { key: 'memorial', label: zhCN.moods.memorial, color: '#B96F57' }, // 红色 · 纪念
  { key: 'new_start', label: zhCN.moods.newStart, color: '#75816B' }, // 绿色 · 新的开始
  { key: 'heartbeat', label: zhCN.moods.heartbeat, color: '#D9A7B8' }, // 粉色 · 心动
  { key: 'growth', label: zhCN.moods.growth, color: '#8B6F5A' }, // 棕色 · 成长与和解
]

const moodMap = new Map(MOODS.map((m) => [m.key, m]))

export function getMood(key: string): { key: Mood; label: string; color: string } {
  return moodMap.get(key as Mood) ?? MOODS[0]!
}

export interface DiaryEntry {
  id: string
  coupleId: string
  authorId: string
  title: string
  content: string
  happenedOn: string // yyyy-mm-dd（本地日历日）
  mood: string
  category: string | null
  visibility: Visibility
  status: DiaryStatus
  createdAt: string
  updatedAt: string
  /** 列表查询附带的照片数 */
  mediaCount?: number
}

export interface DiaryMedia {
  id: string
  diaryEntryId: string
  storagePath: string
  fileName: string
  position: number
}

export interface DiaryInput {
  coupleId: string
  title: string
  content: string
  happenedOn: string
  mood: Mood
  category: string | null
  visibility: Visibility
  status: DiaryStatus
}

export interface DiaryFilter {
  search?: string
  mood?: Mood
  authorId?: string
}

/** 表单校验：返回按字段索引的错误信息（空对象 = 通过） */
export function validateDiaryForm(input: { title: string; content: string; happenedOn: string }): {
  title?: string
  content?: string
  happenedOn?: string
} {
  const errors: { title?: string; content?: string; happenedOn?: string } = {}
  if (input.title.length > 120) errors.title = zhCN.diary.errors.titleTooLong
  if (input.content.trim().length === 0) errors.content = zhCN.diary.errors.contentRequired
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.happenedOn)) errors.happenedOn = zhCN.diary.errors.dateInvalid
  return errors
}
