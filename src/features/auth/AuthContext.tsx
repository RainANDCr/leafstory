/**
 * 认证上下文：只负责会话状态（userId/email/ready）；
 * 云端（Supabase Auth）与本地模式经 authService 统一抽象，此处不感知差异。
 * 档案与配对信息由各页面按需经 react-query 获取。
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { fetchSession, onSessionChange, type SessionState } from '@/services/authService'

interface AuthState extends SessionState {
  /** 首次会话探测完成前为 false，避免登录态闪烁 */
  ready: boolean
}

const AuthContext = createContext<AuthState>({ userId: null, email: null, ready: false })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ userId: null, email: null, ready: false })

  useEffect(() => {
    let mounted = true
    void fetchSession().then((s) => {
      if (mounted) setState({ ...s, ready: true })
    })
    const off = onSessionChange((s) => setState({ ...s, ready: true }))
    return () => {
      mounted = false
      off()
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  return useContext(AuthContext)
}
