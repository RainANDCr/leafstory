/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase 项目 URL，形如 https://xxxx.supabase.co */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase 匿名公钥（anon public key）。仅此 Key 允许进入前端，service_role 绝不前端使用 */
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** 可选：自部署的 AI 中转地址（supabase/functions/ai-polish）。不配置时浏览器直连用户自己的服务 */
  readonly VITE_AI_PROXY_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
