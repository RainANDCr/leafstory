/**
 * 个人档案：读取与更新（昵称、时区）。
 */
import { getSupabase } from '@/lib/supabase'

export interface Profile {
  id: string
  nickname: string
  avatarUrl: string | null
  timezone: string
  createdAt: string
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data, error } = await sb
    .from('profiles')
    .select('id, nickname, avatar_url, timezone, created_at')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id,
    nickname: data.nickname,
    avatarUrl: data.avatar_url,
    timezone: data.timezone,
    createdAt: data.created_at,
  }
}

export async function updateProfile(userId: string, patch: { nickname?: string; timezone?: string }): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('数据库尚未连接')
  const { error } = await sb.from('profiles').update(patch).eq('id', userId)
  if (error) throw error
}
