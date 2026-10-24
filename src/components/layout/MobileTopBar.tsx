import { Link } from 'react-router-dom'
import { SettingsIcon } from './icons'
import { t } from '@/i18n'

/** 移动端顶栏：应用名 + 设置入口（桌面端由侧栏承担） */
export function MobileTopBar() {
  return (
    <header className="mb-4 flex items-center justify-between lg:hidden">
      <Link to="/forest" className="flex items-center gap-2">
        <img src="/favicon.svg" alt="" className="h-7 w-7" />
        <span className="font-display text-base text-bark">{t('app.name')}</span>
      </Link>
      <Link
        to="/settings"
        aria-label={t('nav.settings')}
        className="flex h-11 w-11 items-center justify-center rounded-full text-bark-soft transition-colors hover:bg-paper-edge/60 hover:text-bark"
      >
        <SettingsIcon className="h-5 w-5" />
      </Link>
    </header>
  )
}
