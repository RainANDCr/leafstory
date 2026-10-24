/**
 * 时光邮局：写给未来的信。
 *
 * 隐私模型（与数据库迁移 00004 一致）：
 * - 封套（元数据）与正文分离；列表查询只返回封套，不含标题/正文；
 * - 正文读取唯一入口是 readLetter（云端 = RPC 校验服务端时间；
 *   本地模式 = 在服务层执行同一套校验）；
 * - 撤回仅作者且仅到期前；删除仅作者。
 * 时间约定：unlockAt 存 UTC ISO 字符串，展示按用户本地时区。
 */
import { getSupabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/env'
import { AppError } from '@/lib/errors'
import { zhCN } from '@/i18n'
import * as local from './local/localBackend'

function requireSupabase() {
  const sb = getSupabase()
  if (!sb) throw new Error('数据库尚未连接')
  return sb
}

export type LetterRecipient = 'partner' | 'both'
export type LetterStatus = 'sealed' | 'revoked'

/** 封套：不含任何内容字段，解锁前收件人只知「有一封信」 */
export interface LetterEnvelope {
  id: string
  coupleId: string
  authorId: string
  recipient: LetterRecipient
  unlockAt: string // UTC ISO
  status: LetterStatus
  createdAt: string
}

/** 读取结果（经服务端校验后才会存在） */
export interface LetterContent {
  id: string
  authorId: string
  recipient: LetterRecipient
  unlockAt: string
  status: LetterStatus
  title: string
  body: string
}

export interface LetterInput {
  recipient: LetterRecipient
  /** UTC ISO 时刻 */
  unlockAt: string
  title: string
  body: string
}

interface EnvelopeRow {
  id: string
  couple_id: string
  author_id: string
  recipient: LetterRecipient
  unlock_at: string
  status: LetterStatus
  created_at: string
}

function toEnvelope(row: EnvelopeRow): LetterEnvelope {
  return {
    id: row.id,
    coupleId: row.couple_id,
    authorId: row.author_id,
    recipient: row.recipient,
    unlockAt: row.unlock_at,
    status: row.status,
    createdAt: row.created_at,
  }
}

export async function listLetters(coupleId: string): Promise<LetterEnvelope[]> {
  if (!isSupabaseConfigured) return local.listLetters(coupleId)
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('letters')
    .select('id, couple_id, author_id, recipient, unlock_at, status, created_at')
    .eq('couple_id', coupleId)
    .order('unlock_at', { ascending: true })
  if (error) throw error
  return (data as EnvelopeRow[]).map(toEnvelope)
}

/** 封存：插入封套 + 正文（正文表无 SELECT 策略，此后只能经 readLetter 读） */
export async function sealLetter(coupleId: string, userId: string, input: LetterInput): Promise<void> {
  if (!isSupabaseConfigured) return local.sealLetter(coupleId, userId, input)
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('letters')
    .insert({
      couple_id: coupleId,
      author_id: userId,
      recipient: input.recipient,
      unlock_at: input.unlockAt,
    })
    .select('id')
    .single()
  if (error) throw error
  const { error: contentErr } = await sb.from('letter_contents').insert({
    letter_id: data.id as string,
    title: input.title.trim(),
    body: input.body,
  })
  if (contentErr) {
    // 封套已建但正文失败：清理封套，避免留下空壳
    await sb.from('letters').delete().eq('id', data.id as string)
    throw contentErr
  }
}

/** 读信：云端走 RPC（服务端时间/身份/收件规则校验）；本地执行同套规则 */
export async function readLetter(letterId: string): Promise<LetterContent> {
  if (!isSupabaseConfigured) return local.readLetter(letterId)
  const sb = requireSupabase()
  const { data, error } = await sb.rpc('read_letter', { p_letter_id: letterId })
  if (error) throw new AppError(mapLetterError(error.message))
  return {
    id: data.id,
    authorId: data.authorId,
    recipient: data.recipient,
    unlockAt: data.unlockAt,
    status: data.status,
    title: data.title,
    body: data.body,
  }
}

/** 撤回：仅作者、仅到期前（服务端时间） */
export async function revokeLetter(letterId: string): Promise<void> {
  if (!isSupabaseConfigured) return local.revokeLetter(letterId)
  const sb = requireSupabase()
  const { error } = await sb.rpc('revoke_letter', { p_letter_id: letterId })
  if (error) throw new AppError(mapLetterError(error.message))
}

export async function deleteLetter(letterId: string): Promise<void> {
  if (!isSupabaseConfigured) return local.deleteLetter(letterId)
  const sb = requireSupabase()
  const { error } = await sb.from('letters').delete().eq('id', letterId)
  if (error) throw error
}

/** RPC 的中文异常 → 界面文案（消息本身已无敏感信息，直接透传亦可） */
function mapLetterError(message: string): string {
  if (message.includes('没有到开启时间')) return zhCN.letters.errors.notUnlocked
  if (message.includes('撤回')) return zhCN.letters.errors.revoked
  if (message.includes('无权')) return zhCN.letters.errors.noAccess
  return message
}
