/**
 * 认证：注册 / 登录 / 退出 / 找回密码。
 * 会话由 supabase-js 持久化管理；这里只做动作与错误包装。
 */
import { getSupabase } from '@/lib/supabase'
import { AppError } from '@/lib/errors'

function requireSupabase() {
  const sb = getSupabase()
  if (!sb) throw new AppError('数据库尚未连接，请先完成配置。')
  return sb
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await requireSupabase().auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error) throw error
}

/** 注册成功但项目开启邮箱验证时，session 为空 —— 由调用方提示查收邮件 */
export async function signUp(email: string, password: string, nickname: string): Promise<boolean> {
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
  await requireSupabase().auth.signOut()
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await requireSupabase().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: window.location.origin,
  })
  if (error) throw error
}
