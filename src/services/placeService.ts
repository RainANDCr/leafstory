/**
 * 双人恋爱地图：地点足迹的 CRUD 与日记关联。
 * 隐私：关联行可见性跟随日记（云端 RLS / 本地同套规则）；
 * 经纬度只在用户主动提供（或逐次授权定位）时保存，绝无自动采集。
 */
import { getSupabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/env'
import * as local from './local/localBackend'

function requireSupabase() {
  const sb = getSupabase()
  if (!sb) throw new Error('数据库尚未连接')
  return sb
}

export interface Place {
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
  /** 当前用户可见的关联日记（含标题摘要） */
  linkedDiaries: Array<{ id: string; title: string; happenedOn: string }>
}

export interface PlaceInput {
  name: string
  region: string | null
  note: string | null
  happenedOn: string | null
  latitude: number | null
  longitude: number | null
  isSpecial: boolean
  specialLabel: string | null
  /** 关联日记（按选择顺序；null 表示不改动，空数组表示清空） */
  diaryIds?: string[]
}

const PLACE_SELECT = 'id, couple_id, name, region, note, happened_on, latitude, longitude, is_special, special_label, created_by, created_at, updated_at'

interface PlaceRow {
  id: string
  couple_id: string
  name: string
  region: string | null
  note: string | null
  happened_on: string | null
  latitude: string | number | null
  longitude: string | number | null
  is_special: boolean
  special_label: string | null
  created_by: string
  created_at: string
  updated_at: string
}

function num(v: string | number | null): number | null {
  return v === null ? null : Number(v)
}

export async function listPlaces(coupleId: string): Promise<Place[]> {
  if (!isSupabaseConfigured) return local.listPlaces(coupleId)
  const sb = requireSupabase()

  const { data: rows, error } = await sb
    .from('places')
    .select(PLACE_SELECT)
    .eq('couple_id', coupleId)
    .order('happened_on', { ascending: false, nullsFirst: false })
  if (error) throw error

  // 关联日记：RLS 已按可见性过滤（私密日记的关联行只回给作者）
  const { data: links, error: linkErr } = await sb
    .from('diary_place_links')
    .select('place_id, diary_entry_id, diary_entries!inner(id, title, happened_on)')
  if (linkErr) throw linkErr

  const byPlace = new Map<string, Array<{ id: string; title: string; happenedOn: string }>>()
  for (const link of (links ?? []) as Array<{ place_id: string; diary_entries: Array<{ id: string; title: string; happened_on: string }> }>) {
    const entry = link.diary_entries?.[0]
    if (!entry) continue
    const list = byPlace.get(link.place_id) ?? []
    list.push({ id: entry.id, title: entry.title, happenedOn: entry.happened_on })
    byPlace.set(link.place_id, list)
  }

  return (rows as PlaceRow[]).map((row) => ({
    id: row.id,
    coupleId: row.couple_id,
    name: row.name,
    region: row.region,
    note: row.note,
    happenedOn: row.happened_on,
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    isSpecial: row.is_special,
    specialLabel: row.special_label,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    linkedDiaries: byPlace.get(row.id) ?? [],
  }))
}

export async function createPlace(coupleId: string, userId: string, input: PlaceInput): Promise<void> {
  if (!isSupabaseConfigured) return local.createPlace(coupleId, userId, input)
  const sb = requireSupabase()
  await assertDiariesLinkable(sb, coupleId, input.diaryIds)
  const { data, error } = await sb
    .from('places')
    .insert(toRow(coupleId, userId, input))
    .select('id')
    .single()
  if (error) throw error
  await syncLinks(sb, data.id as string, userId, input.diaryIds)
}

/** 预检：所有待关联日记必须属于本空间且对当前用户可见（RLS 过滤后数量一致） */
async function assertDiariesLinkable(
  sb: ReturnType<typeof requireSupabase>,
  coupleId: string,
  diaryIds: string[] | undefined,
): Promise<void> {
  if (!diaryIds || diaryIds.length === 0) return
  const { data, error } = await sb
    .from('diary_entries')
    .select('id')
    .eq('couple_id', coupleId)
    .in('id', diaryIds)
  if (error) throw error
  const visibleIds = new Set((data ?? []).map((r) => r.id as string))
  for (const id of diaryIds) {
    if (!visibleIds.has(id)) throw new Error('NOT_FOUND')
  }
}

export async function updatePlace(id: string, input: PlaceInput, userId: string): Promise<void> {
  if (!isSupabaseConfigured) return local.updatePlace(id, input, userId)
  const sb = requireSupabase()
  const { error } = await sb
    .from('places')
    .update({
      name: input.name.trim(),
      region: input.region?.trim() || null,
      note: input.note?.trim() || null,
      happened_on: input.happenedOn || null,
      latitude: input.latitude,
      longitude: input.longitude,
      is_special: input.isSpecial,
      special_label: input.isSpecial ? input.specialLabel?.trim() || null : null,
    })
    .eq('id', id)
  if (error) throw error
  if (input.diaryIds) await syncLinks(sb, id, userId, input.diaryIds)
}

function toRow(coupleId: string, userId: string, input: PlaceInput): Record<string, unknown> {
  return {
    couple_id: coupleId,
    created_by: userId,
    name: input.name.trim(),
    region: input.region?.trim() || null,
    note: input.note?.trim() || null,
    happened_on: input.happenedOn || null,
    latitude: input.latitude,
    longitude: input.longitude,
    is_special: input.isSpecial,
    special_label: input.isSpecial ? input.specialLabel?.trim() || null : null,
  }
}

async function syncLinks(
  sb: ReturnType<typeof requireSupabase>,
  placeId: string,
  userId: string,
  diaryIds: string[] | undefined,
): Promise<void> {
  if (!diaryIds) return
  // 先校验（该地点的空间 + 日记可见性），全部通过才替换，避免替换一半
  const { data: placeRow, error: placeErr } = await sb.from('places').select('couple_id').eq('id', placeId).single()
  if (placeErr) throw placeErr
  await assertDiariesLinkable(sb, placeRow.couple_id as string, diaryIds)

  await sb.from('diary_place_links').delete().eq('place_id', placeId)
  for (const diaryId of diaryIds) {
    const { error } = await sb
      .from('diary_place_links')
      .insert({ place_id: placeId, diary_entry_id: diaryId, linked_by: userId })
    if (error) throw error
  }
}

/** 删除地点只删关联行，不删日记 */
export async function deletePlace(id: string): Promise<void> {
  if (!isSupabaseConfigured) return local.deletePlace(id)
  const sb = requireSupabase()
  const { error } = await sb.from('places').delete().eq('id', id)
  if (error) throw error
}
