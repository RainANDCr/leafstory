/**
 * 认证上下文：只负责 Supabase 会话状态；
 * 档案与配对信息由各页面按需经 react-query 获取。
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/env'

interface AuthState {
  session: Session | null
  userId: string | null
  /** 首次会话探测完成前为 false，避免登录态闪烁 */
  ready: boolean
}

const AuthContext = createContext<AuthState>({ session: null, userId: null, ready: false })

export function AuthProvider({ children }: { children: ReactNode }) {
  // 未配置时无需异步探测，直接就绪
  const [state, setState] = useState<AuthState>(() =>
    isSupabaseConfigured ? { session: null, userId: null, ready: false } : { session: null, userId: null, ready: true },
  )

  useEffect(() => {
    const sb = getSupabase()
    if (!sb) return

    let mounted = true
    void sb.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setState({ session: data.session, userId: data.session?.user.id ?? null, ready: true })
    })

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setState({ session, userId: session?.user.id ?? null, ready: true })
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  return useContext(AuthContext)
}
