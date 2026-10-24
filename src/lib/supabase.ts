/**
 * Supabase 客户端单例。
 *
 * 未配置环境变量时返回 null，调用方必须处理 null 并向用户明确
 * 「数据不会保存」，不允许假装连接成功。
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabaseEnv } from './env'

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null
  client ??= createClient(supabaseEnv.url as string, supabaseEnv.anonKey as string, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  })
  return client
}
