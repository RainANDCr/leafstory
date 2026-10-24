/**
 * 双人空间：状态查询、创建、凭邀请码加入。
 *
 * 邀请码的生成与校验全部在数据库 RPC 内完成（00002 迁移）：
 * 只存哈希、24 小时有效、一次性、事务内校验人数上限。
 */
import { getSupabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/env'
import * as local from './local/localBackend'

export interface CoupleMember {
  userId: string
  nickname: string
  role: 'founder' | 'member'
  joinedAt: string
}

export interface CoupleInfo {
  coupleId: string
  displayName: string | null
  createdAt: string
  members: CoupleMember[]
  /** 我在空间里的角色 */
  myRole: 'founder' | 'member'
}

export type PairingState = 'unpaired' | 'waiting' | 'paired'

export interface CoupleSnapshot {
  state: PairingState
  info: CoupleInfo | null
}

export async function getCoupleSnapshot(userId: string): Promise<CoupleSnapshot> {
  if (!isSupabaseConfigured) return local.getCoupleSnapshot(userId)
  const sb = getSupabase()
  if (!sb) return { state: 'unpaired', info: null }

  const { data: mine, error: e1 } = await sb
    .from('couple_members')
    .select('couple_id, role, joined_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (e1) throw e1
  if (!mine) return { state: 'unpaired', info: null }

  const [{ data: couple, error: e2 }, { data: members, error: e3 }] = await Promise.all([
    sb.from('couples').select('id, display_name, created_at').eq('id', mine.couple_id).single(),
    sb.from('couple_members').select('user_id, role, joined_at').eq('couple_id', mine.couple_id),
  ])
  if (e2) throw e2
  if (e3) throw e3

  const userIds = (members ?? []).map((m) => m.user_id)
  const { data: profiles, error: e4 } = await sb
    .from('profiles')
    .select('id, nickname')
    .in('id', userIds)
  if (e4) throw e4
  const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.nickname]))

  const info: CoupleInfo = {
    coupleId: couple.id,
    displayName: couple.display_name,
    createdAt: couple.created_at,
    members: (members ?? []).map((m) => ({
      userId: m.user_id,
      nickname: nameMap.get(m.user_id) ?? '旅人',
      role: m.role,
      joinedAt: m.joined_at,
    })),
    myRole: mine.role,
  }

  return { state: info.members.length >= 2 ? 'paired' : 'waiting', info }
}

/** 创建二人空间，返回明文邀请码（仅此一次展示） */
export async function createCoupleSpace(displayName: string): Promise<string> {
  if (!isSupabaseConfigured) return local.createCoupleSpace(displayName)
  const sb = getSupabase()
  if (!sb) throw new Error('数据库尚未连接')
  const { data, error } = await sb.rpc('create_couple_space', { p_display_name: displayName || null })
  if (error) throw error
  return data as string
}

/** 待配对时重新生成邀请码 */
export async function regenerateInvitation(): Promise<{ code: string; expiresAt: string }> {
  if (!isSupabaseConfigured) return local.regenerateInvitation()
  const sb = getSupabase()
  if (!sb) throw new Error('数据库尚未连接')
  const { data, error } = await sb.rpc('create_couple_invitation')
  if (error) throw error
  return { code: data.code as string, expiresAt: data.expiresAt as string }
}

/** 待用邀请的元数据（不含明文码）：用于显示剩余有效期 */
export async function getPendingInvitation(): Promise<{ expiresAt: string } | null> {
  if (!isSupabaseConfigured) return local.getPendingInvitation()
  const sb = getSupabase()
  if (!sb) return null
  const { data, error } = await sb.rpc('get_my_couple_invitation')
  if (error) throw error
  return (data as { expiresAt: string } | null) ?? null
}

/** 凭邀请码加入，返回 couple_id */
export async function joinCouple(code: string): Promise<string> {
  if (!isSupabaseConfigured) return local.joinCouple(code)
  const sb = getSupabase()
  if (!sb) throw new Error('数据库尚未连接')
  const { data, error } = await sb.rpc('join_couple_with_code', { p_code: code.trim().toUpperCase() })
  if (error) throw error
  return data as string
}

/**
 * 解除配对：删除双方成员关系（云端 RPC / 本地同构）。
 * 后果：双方立即停止互相访问；各自写的日记仍归各自可见；
 * 共同数据（纪念日/地点/心愿/问答/信件）保留但被冻结（双方均不可见）。
 */
export async function dissolveCouple(): Promise<void> {
  if (!isSupabaseConfigured) return local.dissolveCouple()
  const sb = getSupabase()
  if (!sb) throw new Error('数据库尚未连接')
  const { error } = await sb.rpc('dissolve_couple')
  if (error) throw error
}
