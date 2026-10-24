/**
 * 环境变量读取。
 *
 * 只允许在这里读取 import.meta.env，其余模块统一从此处导入，
 * 便于校验与测试。前端永远不出现 Supabase service_role 等私密 Key。
 */
const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const supabaseEnv = {
  url,
  anonKey,
} as const

/** 仅在 URL 与 anon key 都配置时视为已连接 */
export const isSupabaseConfigured = Boolean(url && anonKey)
