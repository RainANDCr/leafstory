import { createBrowserRouter, createHashRouter, Navigate, RouterProvider } from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { ForestPage } from '@/pages/ForestPage'
import { DiaryPage } from '@/pages/DiaryPage'
import { DiaryEditorPage } from '@/pages/DiaryEditorPage'
import { DiaryDetailPage } from '@/pages/DiaryDetailPage'
import { StoryPage } from '@/pages/StoryPage'
import { StoryMonthPage } from '@/pages/StoryMonthPage'
import { StoryBookPage } from '@/pages/StoryBookPage'
import { GoldenLeafPage } from '@/pages/GoldenLeafPage'
import { PrintBookPage, PrintDiaryPage, PrintMonthPage } from '@/pages/PrintPages'
import { PrintGoldenPage } from '@/pages/PrintGoldenPage'
import { InteractPage } from '@/pages/InteractPage'
import { FootprintsPage } from '@/pages/FootprintsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { LoginPage } from '@/pages/LoginPage'
import { PairingPage } from '@/pages/PairingPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

function createRoutes() {
  return [
    {
      path: '/',
      element: <AppLayout />,
      children: [
        { index: true, element: <Navigate to="/forest" replace /> },
        {
          // 需要登录的页面：未登录跳转 /login 并记住来路
          element: <RequireAuth />,
          children: [
            { path: 'forest', element: <ForestPage /> },
            { path: 'diary', element: <DiaryPage /> },
            { path: 'diary/new', element: <DiaryEditorPage /> },
            { path: 'diary/:id', element: <DiaryDetailPage /> },
            { path: 'diary/:id/edit', element: <DiaryEditorPage /> },
            { path: 'story', element: <StoryPage /> },
            { path: 'story/month/:yearMonth', element: <StoryMonthPage /> },
            { path: 'story/book/:id', element: <StoryBookPage /> },
            { path: 'story/golden/:year', element: <GoldenLeafPage /> },
            { path: 'print/diary/:id', element: <PrintDiaryPage /> },
            { path: 'print/month/:yearMonth', element: <PrintMonthPage /> },
            { path: 'print/book/:id', element: <PrintBookPage /> },
            { path: 'print/golden/:year', element: <PrintGoldenPage /> },
            { path: 'interact', element: <InteractPage /> },
            { path: 'footprints', element: <FootprintsPage /> },
            { path: 'settings', element: <SettingsPage /> },
            { path: 'pairing', element: <PairingPage /> },
          ],
        },
        { path: 'login', element: <LoginPage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ]
}

function createAppRouter() {
  // 桌面（Electron，file://）用 HashRouter；网页用 BrowserRouter：
  // - GitHub Pages 部署在 /<repo>/ 子路径时由构建期 --base 注入 basename；
  // - 本地开发与根路径部署时 BASE_URL 为 '/'，basename 为空。
  const isDesktop = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent)
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

  if (isDesktop) return createHashRouter(createRoutes())
  return createBrowserRouter(createRoutes(), { basename: basename || undefined })
}

export function AppRouter() {
  return <RouterProvider router={createAppRouter()} />
}
