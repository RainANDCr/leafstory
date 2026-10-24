/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase 项目 URL，形如 https://xxxx.supabase.co */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase 匿名公钥（anon public key）。仅此 Key 允许进入前端，service_role 绝不前端使用 */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
