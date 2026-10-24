import { Outlet } from 'react-router-dom'
import { BottomNav } from '@/components/layout/BottomNav'
import { SideNav } from '@/components/layout/SideNav'
import { MobileTopBar } from '@/components/layout/MobileTopBar'
import { SetupBanner } from '@/components/layout/SetupBanner'
import { t } from '@/i18n'

/**
 * 应用外壳：移动端「顶栏 + 底部导航」，桌面端「左侧栏」。
 * 主内容预留底部导航高度，键盘用户可通过跳转链接直达内容。
 */
export function AppLayout() {
  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-bark focus:px-4 focus:py-2 focus:text-sm focus:text-paper"
      >
        {t('common.backHome')}
      </a>

      <SideNav />

      <div className="lg:pl-60">
        <div className="mx-auto w-full max-w-3xl px-4 pt-3 lg:px-10 lg:pt-8">
          <MobileTopBar />
          <SetupBanner />
          <main id="main-content" className="pb-28 lg:pb-12">
            <Outlet />
          </main>
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
