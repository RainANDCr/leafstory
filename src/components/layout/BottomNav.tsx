import { NavLink } from 'react-router-dom'
import { mainNavItems } from './navItems'
import { t } from '@/i18n'

/** 移动端底部导航：固定在底部，预留安全区；桌面端隐藏（使用侧栏） */
export function BottomNav() {
  return (
    <nav
      aria-label={t('nav.main')}
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-paper-edge bg-paper/95 backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {mainNavItems.map(({ to, label, Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px] transition-colors ${
                  isActive ? 'text-bark' : 'text-bark-soft/80 hover:text-bark'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`flex h-8 w-10 items-center justify-center rounded-full transition-colors ${
                      isActive ? 'bg-leaf-gold/20 text-leaf-gold' : ''
                    }`}
                  >
                    <Icon className="h-5.5 w-5.5" />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
