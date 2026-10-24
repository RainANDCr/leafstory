import { NavLink, Link } from 'react-router-dom'
import { mainNavItems } from './navItems'
import { SettingsIcon } from './icons'
import { t } from '@/i18n'

/** 桌面端侧栏：品牌区 + 主导航 + 设置；移动端隐藏（使用底部导航） */
export function SideNav() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-paper-edge bg-paper/90 px-5 py-6 lg:flex">
      <Link to="/forest" className="mb-8 flex items-center gap-3">
        <img src="/favicon.svg" alt="" className="h-9 w-9" />
        <span>
          <span className="block font-display text-lg leading-6 text-bark">{t('app.name')}</span>
          <span className="block text-[11px] leading-4 text-bark-soft">{t('app.tagline')}</span>
        </span>
      </Link>

      <nav aria-label={t('nav.main')}>
        <ul className="space-y-1">
          {mainNavItems.map(({ to, label, Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm transition-colors ${
                    isActive
                      ? 'bg-leaf-gold/15 font-medium text-bark'
                      : 'text-bark-soft hover:bg-paper-edge/50 hover:text-bark'
                  }`
                }
              >
                <Icon className="h-5 w-5" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm transition-colors ${
              isActive
                ? 'bg-leaf-gold/15 font-medium text-bark'
                : 'text-bark-soft hover:bg-paper-edge/50 hover:text-bark'
            }`
          }
        >
          <SettingsIcon className="h-5 w-5" />
          {t('nav.settings')}
        </NavLink>
      </div>
    </aside>
  )
}
