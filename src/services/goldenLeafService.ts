/** 年度金叶：只存用户自己选的年度标题与最珍贵的一天（云端 + 本地同构） */
import { getSupabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/env'
import * as local from './local/localBackend'

export interface GoldenLeaf {
  coupleId: string
  year: number
  title: string | null
  preciousDay: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

function requireSupabase() {
  const sb = getSupabase()
  if (!sb) throw new Error('数据库尚未连接')
  return sb
}

interface Row {
  couple_id: string
  year: number
  title: string | null
  precious_day: string | null
  created_by: string
  created_at: string
  updated_at: string
}

function toLeaf(row: Row): GoldenLeaf {
  return {
    coupleId: row.couple_id,
    year: row.year,
    title: row.title,
    preciousDay: row.precious_day,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getGoldenLeaf(coupleId: string, year: number): Promise<GoldenLeaf | null> {
  if (!isSupabaseConfigured) return local.getGoldenLeaf(coupleId, year)
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('golden_leaves')
    .select('*')
    .eq('couple_id', coupleId)
    .eq('year', year)
    .maybeSingle()
  if (error) throw error
  return data ? toLeaf(data as Row) : null
}

export async function saveGoldenLeaf(
  coupleId: string,
  year: number,
  userId: string,
  patch: { title: string | null; preciousDay: string | null },
): Promise<void> {
  if (!isSupabaseConfigured) return local.saveGoldenLeaf(coupleId, year, userId, patch)
  const sb = requireSupabase()
  const { error } = await sb.from('golden_leaves').upsert(
    {
      couple_id: coupleId,
      year,
      title: patch.title,
      precious_day: patch.preciousDay,
      created_by: userId,
    },
    { onConflict: 'couple_id,year' },
  )
  if (error) throw error
}
