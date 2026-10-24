/**
 * 纪念日数据访问。倒计时与「下一次发生日」的展示逻辑在 lib/dates（本地日历日语义）。
 */
import { getSupabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/env'
import * as local from './local/localBackend'

export type AnniversaryKind = 'met' | 'together' | 'birthday' | 'first_date' | 'custom'

export interface Anniversary {
  id: string
  coupleId: string
  title: string
  kind: AnniversaryKind
  anniversaryDate: string // yyyy-mm-dd
  repeatsYearly: boolean
  note: string | null
  linkedDiaryId: string | null
  createdBy: string
  createdAt: string
}

function requireSupabase() {
  const sb = getSupabase()
  if (!sb) throw new Error('数据库尚未连接')
  return sb
}

interface Row {
  id: string
  couple_id: string
  title: string
  kind: AnniversaryKind
  anniversary_date: string
  repeats_yearly: boolean
  note: string | null
  linked_diary_id: string | null
  created_by: string
  created_at: string
}

const SELECT = 'id, couple_id, title, kind, anniversary_date, repeats_yearly, note, linked_diary_id, created_by, created_at'

function toAnniversary(row: Row): Anniversary {
  return {
    id: row.id,
    coupleId: row.couple_id,
    title: row.title,
    kind: row.kind,
    anniversaryDate: row.anniversary_date,
    repeatsYearly: row.repeats_yearly,
    note: row.note,
    linkedDiaryId: row.linked_diary_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

export async function listAnniversaries(coupleId: string): Promise<Anniversary[]> {
  if (!isSupabaseConfigured) return local.listAnniversaries(coupleId)
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('anniversaries')
    .select(SELECT)
    .eq('couple_id', coupleId)
    .order('anniversary_date', { ascending: true })
  if (error) throw error
  return (data as Row[]).map(toAnniversary)
}

export interface AnniversaryInput {
  title: string
  kind: AnniversaryKind
  anniversaryDate: string
  repeatsYearly: boolean
  note: string | null
}

export async function createAnniversary(coupleId: string, userId: string, input: AnniversaryInput): Promise<void> {
  if (!isSupabaseConfigured) return local.createAnniversary(coupleId, userId, input)
  const sb = requireSupabase()
  const { error } = await sb.from('anniversaries').insert({
    couple_id: coupleId,
    created_by: userId,
    title: input.title.trim(),
    kind: input.kind,
    anniversary_date: input.anniversaryDate,
    repeats_yearly: input.repeatsYearly,
    note: input.note?.trim() || null,
  })
  if (error) throw error
}

export async function updateAnniversary(id: string, input: AnniversaryInput): Promise<void> {
  if (!isSupabaseConfigured) return local.updateAnniversary(id, input)
  const sb = requireSupabase()
  const { error } = await sb
    .from('anniversaries')
    .update({
      title: input.title.trim(),
      kind: input.kind,
      anniversary_date: input.anniversaryDate,
      repeats_yearly: input.repeatsYearly,
      note: input.note?.trim() || null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteAnniversary(id: string): Promise<void> {
  if (!isSupabaseConfigured) return local.deleteAnniversary(id)
  const sb = requireSupabase()
  const { error } = await sb.from('anniversaries').delete().eq('id', id)
  if (error) throw error
}
