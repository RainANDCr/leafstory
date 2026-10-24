/**
 * 恋爱故事书：自定义专题的 CRUD 与条目管理。
 * 月度/年度章节是查询侧的虚拟聚合（不落库），见 features/story/logic.ts。
 * 条目引用日记：日记删除 → 条目自动移除（外键级联）；
 * 日记改为私密 → 读取侧按可见性解析，返回占位而不泄露内容。
 */
import { getSupabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/env'
import type { DiaryEntry } from '@/features/diary/types'
import * as local from './local/localBackend'

function requireSupabase() {
  const sb = getSupabase()
  if (!sb) throw new Error('数据库尚未连接')
  return sb
}

export interface StoryBook {
  id: string
  coupleId: string
  title: string
  intro: string | null
  /** 封面心情色（六选一） */
  coverMood: string | null
  position: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface StoryBookInput {
  title: string
  intro: string | null
  coverMood: string | null
  /** 按顺序的日记 ID；undefined 表示不改动条目 */
  entryIds?: string[]
}

export interface StoryBookDetail {
  book: StoryBook
  /** 按既定顺序的条目（含已不可见的占位） */
  items: Array<{ entryId: string; position: number }>
  /** 当前用户仍可见的日记（含正文等完整字段） */
  entries: DiaryEntry[]
  /** 已删除或对当前用户不可见的条目 ID */
  missingEntryIds: string[]
}

const BOOK_SELECT = 'id, couple_id, title, intro, cover_mood, position, created_by, created_at, updated_at'

interface BookRow {
  id: string
  couple_id: string
  title: string
  intro: string | null
  cover_mood: string | null
  position: number
  created_by: string
  created_at: string
  updated_at: string
}

function toBook(row: BookRow): StoryBook {
  return {
    id: row.id,
    coupleId: row.couple_id,
    title: row.title,
    intro: row.intro,
    coverMood: row.cover_mood,
    position: row.position,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listStoryBooks(coupleId: string): Promise<StoryBook[]> {
  if (!isSupabaseConfigured) return local.listStoryBooks(coupleId)
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('story_books')
    .select(BOOK_SELECT)
    .eq('couple_id', coupleId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as BookRow[]).map(toBook)
}

export async function getStoryBook(id: string): Promise<StoryBookDetail> {
  if (!isSupabaseConfigured) return local.getStoryBook(id)
  const sb = requireSupabase()

  const { data: bookRow, error: bookErr } = await sb.from('story_books').select(BOOK_SELECT).eq('id', id).maybeSingle()
  if (bookErr) throw bookErr
  if (!bookRow) throw new Error('NOT_FOUND')
  const book = toBook(bookRow as BookRow)

  const { data: itemRows, error: itemsErr } = await sb
    .from('story_book_items')
    .select('diary_entry_id, position')
    .eq('story_book_id', id)
    .order('position', { ascending: true })
  if (itemsErr) throw itemsErr
  const items = (itemRows ?? []).map((r: { diary_entry_id: string; position: number }) => ({
    entryId: r.diary_entry_id,
    position: r.position,
  }))

  return resolveEntries(book, items, async (ids) => {
    if (ids.length === 0) return []
    const { data: entryRows, error } = await sb
      .from('diary_entries')
      .select('id, couple_id, author_id, title, content, happened_on, mood, category, visibility, status, created_at, updated_at')
      .in('id', ids)
    if (error) throw error
    return entryRows as Array<Record<string, unknown>>
  })
}

/** 条目 → 可见日记解析：不可见/已删除的进入 missingEntryIds（占位），不抛错不泄露 */
async function resolveEntries(
  book: StoryBook,
  items: Array<{ entryId: string; position: number }>,
  fetchByIds: (ids: string[]) => Promise<Array<Record<string, unknown>>>,
): Promise<StoryBookDetail> {
  const ids = items.map((i) => i.entryId)
  const rows = await fetchByIds(ids)
  const entryMap = new Map(rows.map((r) => [r.id as string, r]))
  const entries: DiaryEntry[] = []
  const missingEntryIds: string[] = []
  for (const item of items) {
    const row = entryMap.get(item.entryId)
    if (row) {
      entries.push({
        id: row.id as string,
        coupleId: row.couple_id as string,
        authorId: row.author_id as string,
        title: row.title as string,
        content: row.content as string,
        happenedOn: row.happened_on as string,
        mood: row.mood as string,
        category: (row.category as string | null) ?? null,
        visibility: row.visibility as 'shared' | 'private',
        status: row.status as 'draft' | 'published',
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      })
    } else {
      missingEntryIds.push(item.entryId)
    }
  }
  return { book, items, entries, missingEntryIds }
}

export async function createStoryBook(coupleId: string, userId: string, input: StoryBookInput): Promise<string> {
  if (!isSupabaseConfigured) return local.createStoryBook(coupleId, userId, input)
  const sb = requireSupabase()

  const { count } = await sb.from('story_books').select('id', { count: 'exact', head: true }).eq('couple_id', coupleId)
  const { data: bookRow, error: bookErr } = await sb
    .from('story_books')
    .insert({
      couple_id: coupleId,
      title: input.title.trim(),
      intro: input.intro?.trim() || null,
      cover_mood: input.coverMood,
      position: count ?? 0,
      created_by: userId,
    })
    .select('id')
    .single()
  if (bookErr) throw bookErr
  const bookId = bookRow.id as string

  await insertItems(sb, bookId, userId, input.entryIds ?? [])
  return bookId
}

async function insertItems(
  sb: ReturnType<typeof requireSupabase>,
  bookId: string,
  userId: string,
  entryIds: string[],
): Promise<void> {
  if (entryIds.length === 0) return
  const { error } = await sb.from('story_book_items').insert(
    entryIds.map((entryId, index) => ({
      story_book_id: bookId,
      diary_entry_id: entryId,
      position: index,
      added_by: userId,
    })),
  )
  if (error) throw error
}

export async function updateStoryBook(id: string, input: StoryBookInput): Promise<void> {
  if (!isSupabaseConfigured) return local.updateStoryBook(id, input)
  const sb = requireSupabase()

  const { error } = await sb
    .from('story_books')
    .update({
      title: input.title.trim(),
      intro: input.intro?.trim() || null,
      cover_mood: input.coverMood,
    })
    .eq('id', id)
  if (error) throw error

  if (input.entryIds) {
    await sb.from('story_book_items').delete().eq('story_book_id', id)
    const {
      data: { user },
    } = await sb.auth.getUser()
    await insertItems(sb, id, user?.id ?? '', input.entryIds)
  }
}

/** 删除专题本体；条目级联删除，原始日记保留 */
export async function deleteStoryBook(id: string): Promise<void> {
  if (!isSupabaseConfigured) return local.deleteStoryBook(id)
  const sb = requireSupabase()
  const { error } = await sb.from('story_books').delete().eq('id', id)
  if (error) throw error
}

/** 拖动排序后的整表顺序更新 */
export async function reorderStoryBooks(ids: string[]): Promise<void> {
  if (!isSupabaseConfigured) return local.reorderStoryBooks(ids)
  const sb = requireSupabase()
  for (let index = 0; index < ids.length; index++) {
    const { error } = await sb.from('story_books').update({ position: index }).eq('id', ids[index]!)
    if (error) throw error
  }
}
