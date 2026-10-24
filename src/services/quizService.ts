/**
 * 默契小问答：双方独立作答，**双方都提交后**才互相可见。
 * 两阶段可见性由数据库 RLS 强制（本地模式在服务层执行同套规则）：
 * 对方答案在「对方已提交 且 我已提交」前不可读——直接查接口也无法绕过。
 * 不做任何评分或默契度判定，只呈现彼此的视角。
 */
import { getSupabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/env'
import * as local from './local/localBackend'

function requireSupabase() {
  const sb = getSupabase()
  if (!sb) throw new Error('数据库尚未连接')
  return sb
}

export interface QuizAnswerView {
  authorId: string
  content: string
  emoji: string | null
  submitted: boolean
  submittedAt: string | null
}

export interface QuizSessionView {
  id: string
  questionId: string
  status: 'open' | 'revealed'
  startedBy: string
  endedEarlyBy: string | null
  createdAt: string
  /** 我的答案（可能尚无） */
  myAnswer: QuizAnswerView | null
  /** 对方答案：只有双方都提交后才会出现（否则为 null，且不知对方是否已写草稿） */
  partnerAnswer: QuizAnswerView | null
  /** 双方都已提交 */
  bothSubmitted: boolean
  isFavorite: boolean
}

export async function listQuizSessions(coupleId: string, myUserId: string, partnerUserId: string | null): Promise<QuizSessionView[]> {
  if (!isSupabaseConfigured) return local.listQuizSessions(coupleId, myUserId, partnerUserId)
  const sb = requireSupabase()

  const [{ data: sessions, error: e1 }, { data: favorites, error: e3 }] = await Promise.all([
    sb.from('question_sessions').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false }),
    sb.from('question_favorites').select('session_id'),
  ])
  if (e1) throw e1
  if (e3) throw e3
  const favoriteSet = new Set((favorites ?? []).map((f) => f.session_id as string))

  // 答案由 RLS 按两阶段可见性过滤：见到的对方答案必然是可揭晓的
  const { data: answers, error: e2 } = await sb
    .from('question_answers')
    .select('session_id, author_id, content, emoji, submitted, submitted_at')
    .in('session_id', (sessions ?? []).map((s) => s.id))
  if (e2) throw e2

  return (sessions ?? []).map((s) => {
    const rows = (answers ?? []).filter((a) => a.session_id === s.id)
    const mine = rows.find((a) => a.author_id === myUserId)
    const partner = partnerUserId ? rows.find((a) => a.author_id === partnerUserId) : undefined
    return {
      id: s.id,
      questionId: s.question_id,
      status: s.status,
      startedBy: s.started_by,
      endedEarlyBy: s.ended_early_by,
      createdAt: s.created_at,
      myAnswer: mine
        ? { authorId: mine.author_id, content: mine.content, emoji: mine.emoji, submitted: mine.submitted, submittedAt: mine.submitted_at }
        : null,
      partnerAnswer: partner
        ? { authorId: partner.author_id, content: partner.content, emoji: partner.emoji, submitted: partner.submitted, submittedAt: partner.submitted_at }
        : null,
      bothSubmitted: Boolean(mine?.submitted && partner?.submitted),
      isFavorite: favoriteSet.has(s.id),
    }
  })
}

export async function startQuizSession(coupleId: string, userId: string, questionId: string): Promise<void> {
  if (!isSupabaseConfigured) return local.startQuizSession(coupleId, userId, questionId)
  const sb = requireSupabase()
  const { error } = await sb.from('question_sessions').insert({
    couple_id: coupleId,
    question_id: questionId,
    started_by: userId,
  })
  if (error) throw error
}

/** 保存/更新我的答案（草稿或提交）。提交后若双方都已交，自动标记会话为已揭晓 */
export async function saveQuizAnswer(
  sessionId: string,
  input: { content: string; emoji: string | null; submit: boolean },
): Promise<void> {
  if (!isSupabaseConfigured) return local.saveQuizAnswer(sessionId, input)
  const sb = requireSupabase()
  const {
    data: { user },
  } = await sb.auth.getUser()
  const userId = user?.id ?? ''

  const { data: existing } = await sb
    .from('question_answers')
    .select('id')
    .eq('session_id', sessionId)
    .eq('author_id', userId)
    .maybeSingle()

  const values = {
    content: input.content,
    emoji: input.emoji,
    submitted: input.submit,
    submitted_at: input.submit ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }

  if (existing) {
    const { error } = await sb.from('question_answers').update(values).eq('id', existing.id as string)
    if (error) throw error
  } else {
    const { error } = await sb.from('question_answers').insert({ session_id: sessionId, author_id: userId, ...values })
    if (error) throw error
  }

  if (input.submit) await maybeReveal(sb, sessionId)
}

async function maybeReveal(sb: ReturnType<typeof requireSupabase>, sessionId: string): Promise<void> {
  const { data } = await sb.from('question_answers').select('submitted').eq('session_id', sessionId)
  const rows = data ?? []
  if (rows.length >= 2 && rows.every((r) => r.submitted)) {
    await sb.from('question_sessions').update({ status: 'revealed' }).eq('id', sessionId)
  }
}

/** 提前结束：展示目前各自可见的内容（对方未提交的答案仍不可见） */
export async function endQuizEarly(sessionId: string, userId: string): Promise<void> {
  if (!isSupabaseConfigured) return local.endQuizEarly(sessionId, userId)
  const sb = requireSupabase()
  const { error } = await sb
    .from('question_sessions')
    .update({ status: 'revealed', ended_early_by: userId })
    .eq('id', sessionId)
  if (error) throw error
}

/** 跳过：删除尚未揭晓且无人提交答案的会话，换一题 */
export async function skipQuizSession(sessionId: string): Promise<void> {
  if (!isSupabaseConfigured) return local.skipQuizSession(sessionId)
  const sb = requireSupabase()
  const { data } = await sb.from('question_answers').select('submitted').eq('session_id', sessionId)
  if ((data ?? []).some((a) => a.submitted)) {
    throw new Error('已有提交的答案，不能跳过；可以「提前结束」')
  }
  const { error } = await sb.from('question_sessions').delete().eq('id', sessionId)
  if (error) throw error
}

/**
 * 收藏为日记：把问题与**当前可见**的回答整理成一篇新日记（用户已确认）。
 * 只写入调用者有权看到的内容；日记本身遵循日记的可见性规则。
 */
export async function favoriteQuizToDiary(sessionId: string, diaryId: string, userId: string): Promise<void> {
  if (!isSupabaseConfigured) return local.favoriteQuizToDiary(sessionId, diaryId, userId)
  const sb = requireSupabase()
  const { error } = await sb.from('question_favorites').insert({
    session_id: sessionId,
    diary_entry_id: diaryId,
    created_by: userId,
  })
  if (error) throw error
}
