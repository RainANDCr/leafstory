/** 需要登录的路由守卫：未登录跳转 /login，并记住来路 */
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { LoadingState } from '@/components/feedback/LoadingState'

export function RequireAuth() {
  const { userId, ready } = useAuth()
  const location = useLocation()

  if (!ready) return <LoadingState />
  if (!userId) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}
