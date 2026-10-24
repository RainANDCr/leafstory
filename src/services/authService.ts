/**
 * 认证：注册 / 登录 / 退出 / 会话查询。
 * 已配置 Supabase 时走云端 Auth；未配置时走本地模式（localStorage）。
 * 会话状态由 onSessionChange 统一订阅，AuthContext 不感知后端差异。
 */
import { getSupabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/env'
import { AppError } from '@/lib/errors'
import * as local from './local/localBackend'

export interface SessionState {
  userId: string | null
  email: string | null
}

function requireSupabase() {
  const sb = getSupabase()
  if (!sb) throw new AppError('数据库尚未连接，请先完成配置。')
  return sb
}

export function fetchSession(): Promise<SessionState> {
  if (!isSupabaseConfigured) return Promise.resolve(local.fetchSession())
  const sb = getSupabase()
  if (!sb) return Promise.resolve({ userId: null, email: null })
  return sb.auth.getSession().then(({ data }) => ({
    userId: data.session?.user.id ?? null,
    email: data.session?.user.email ?? null,
  }))
}

export function onSessionChange(cb: (state: SessionState) => void): () => void {
  if (!isSupabaseConfigured) return local.onSessionChange(cb)
  const sb = getSupabase()
  if (!sb) return () => {}
  const { data } = sb.auth.onAuthStateChange((_event, session) => {
    cb({ userId: session?.user.id ?? null, email: session?.user.email ?? null })
  })
  return () => data.subscription.unsubscribe()
}

export async function signIn(email: string, password: string): Promise<void> {
  if (!isSupabaseConfigured) return local.signIn(email, password)
  const { error } = await requireSupabase().auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error) throw error
}

/** 注册成功但项目开启邮箱验证时，session 为空 —— 由调用方提示查收邮件；本地模式总是直接登录 */
export async function signUp(email: string, password: string, nickname: string): Promise<boolean> {
  if (!isSupabaseConfigured) return local.signUp(email, password, nickname)
  const { data, error } = await requireSupabase().auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { nickname: nickname.trim() || undefined },
      emailRedirectTo: window.location.origin,
    },
  })
  if (error) throw error
  // true = 无需邮箱验证、已直接建立会话；false = 需要先去邮箱确认
  return Boolean(data.session)
}

export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured) return local.signOut()
  await requireSupabase().auth.signOut()
}

export async function requestPasswordReset(email: string): Promise<void> {
  if (!isSupabaseConfigured) return local.requestPasswordReset()
  const { error } = await requireSupabase().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: window.location.origin,
  })
  if (error) throw error
}
