/**
 * 落叶心愿瓶：两位成员共同的心愿清单。
 * 状态变更会写入 wish_events 审计（谁、何时、从什么状态改成什么状态）；
 * 完成的心愿在回忆树上化为金叶（见 ForestPage）。
 */
import { getSupabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/env'
import * as local from './local/localBackend'

function requireSupabase() {
  const sb = getSupabase()
  if (!sb) throw new Error('数据库尚未连接')
  return sb
}

export type WishStatus = 'wish' | 'planned' | 'done' | 'archived'
export type WishPriority = 'low' | 'normal' | 'high'

export interface Wish {
  id: string
  coupleId: string
  title: string
  description: string | null
  createdBy: string
  dueDate: string | null // yyyy-mm-dd
  priority: WishPriority
  status: WishStatus
  placeNote: string | null
  completedAt: string | null
  completedBy: string | null
  createdAt: string
  updatedAt: string
  /** 关联的共享日记 ID（可空） */
  linkedDiaryId: string | null
  linkedDiaryTitle?: string | null
}

export interface WishInput {
  title: string
  description: string | null
  dueDate: string | null
  priority: WishPriority
  placeNote: string | null
}

const WISH_SELECT = `
  id, couple_id, title, description, created_by, due_date, priority, status,
  place_note, completed_at, completed_by, created_at, updated_at,
  wish_diary_links(diary_entry_id)
`

interface WishRow {
  id: string
  couple_id: string
  title: string
  description: string | null
  created_by: string
  due_date: string | null
  priority: WishPriority
  status: WishStatus
  place_note: string | null
  completed_at: string | null
  completed_by: string | null
  created_at: string
  updated_at: string
  wish_diary_links?: Array<{ diary_entry_id: string }>
}

function toWish(row: WishRow): Wish {
  const link = row.wish_diary_links?.[0]?.diary_entry_id ?? null
  return {
    id: row.id,
    coupleId: row.couple_id,
    title: row.title,
    description: row.description,
    createdBy: row.created_by,
    dueDate: row.due_date,
    priority: row.priority,
    status: row.status,
    placeNote: row.place_note,
    completedAt: row.completed_at,
    completedBy: row.completed_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    linkedDiaryId: link,
  }
}

export async function listWishes(coupleId: string): Promise<Wish[]> {
  if (!isSupabaseConfigured) return local.listWishes(coupleId)
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('wishes')
    .select(WISH_SELECT)
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as WishRow[]).map(toWish)
}

export async function createWish(coupleId: string, userId: string, input: WishInput): Promise<void> {
  if (!isSupabaseConfigured) return local.createWish(coupleId, userId, input)
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('wishes')
    .insert({
      couple_id: coupleId,
      created_by: userId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      due_date: input.dueDate || null,
      priority: input.priority,
      place_note: input.placeNote?.trim() || null,
    })
    .select('id')
    .single()
  if (error) throw error
  await sb.from('wish_events').insert({
    wish_id: data.id as string,
    actor_id: userId,
    action: 'created',
    to_status: 'wish',
  })
}

export async function updateWish(id: string, input: WishInput): Promise<void> {
  if (!isSupabaseConfigured) return local.updateWish(id, input)
  const sb = requireSupabase()
  const { error } = await sb
    .from('wishes')
    .update({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      due_date: input.dueDate || null,
      priority: input.priority,
      place_note: input.placeNote?.trim() || null,
    })
    .eq('id', id)
  if (error) throw error
  await recordEdit(sb, id)
}

async function recordEdit(sb: ReturnType<typeof requireSupabase>, wishId: string): Promise<void> {
  const {
    data: { user },
  } = await sb.auth.getUser()
  await sb.from('wish_events').insert({
    wish_id: wishId,
    actor_id: user?.id ?? '',
    action: 'edited',
  })
}

/** 状态推进（协同）：记录操作者与前后状态；完成时写 completed_at/by */
export async function setWishStatus(id: string, to: WishStatus): Promise<void> {
  if (!isSupabaseConfigured) return local.setWishStatus(id, to)
  const sb = requireSupabase()
  const {
    data: { user },
  } = await sb.auth.getUser()
  const userId = user?.id ?? ''

  const { data: current, error: fetchErr } = await sb.from('wishes').select('status').eq('id', id).single()
  if (fetchErr) throw fetchErr

  const patch: Record<string, unknown> = { status: to }
  if (to === 'done') {
    patch.completed_at = new Date().toISOString()
    patch.completed_by = userId
  } else {
    patch.completed_at = null
    patch.completed_by = null
  }
  const { error } = await sb.from('wishes').update(patch).eq('id', id)
  if (error) throw error

  await sb.from('wish_events').insert({
    wish_id: id,
    actor_id: userId,
    action: 'status_changed',
    from_status: current.status,
    to_status: to,
  })
}

/** 绑定/解绑日记：只增删关联行，绝不影响日记本体 */
export async function linkWishDiary(wishId: string, diaryEntryId: string | null, userId: string): Promise<void> {
  if (!isSupabaseConfigured) return local.linkWishDiary(wishId, diaryEntryId, userId)
  const sb = requireSupabase()
  await sb.from('wish_diary_links').delete().eq('wish_id', wishId)
  if (diaryEntryId) {
    const { error } = await sb
      .from('wish_diary_links')
      .insert({ wish_id: wishId, diary_entry_id: diaryEntryId, linked_by: userId })
    if (error) throw error
  }
}

/** 删除心愿：只删心愿与关联行，关联日记保留 */
export async function deleteWish(id: string): Promise<void> {
  if (!isSupabaseConfigured) return local.deleteWish(id)
  const sb = requireSupabase()
  const { error } = await sb.from('wishes').delete().eq('id', id)
  if (error) throw error
}
