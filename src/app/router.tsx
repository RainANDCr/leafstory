import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { ForestPage } from '@/pages/ForestPage'
import { DiaryPage } from '@/pages/DiaryPage'
import { StoryPage } from '@/pages/StoryPage'
import { InteractPage } from '@/pages/InteractPage'
import { FootprintsPage } from '@/pages/FootprintsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { LoginPage } from '@/pages/LoginPage'
import { PairingPage } from '@/pages/PairingPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

function createAppRouter() {
  return createBrowserRouter([
    {
      path: '/',
      element: <AppLayout />,
      children: [
        { index: true, element: <Navigate to="/forest" replace /> },
        { path: 'forest', element: <ForestPage /> },
        { path: 'diary', element: <DiaryPage /> },
        { path: 'story', element: <StoryPage /> },
        { path: 'interact', element: <InteractPage /> },
        { path: 'footprints', element: <FootprintsPage /> },
        { path: 'settings', element: <SettingsPage /> },
        { path: 'login', element: <LoginPage /> },
        { path: 'pairing', element: <PairingPage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ])
}

export function AppRouter() {
  return <RouterProvider router={createAppRouter()} />
}
