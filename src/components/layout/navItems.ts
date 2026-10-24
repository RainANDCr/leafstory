/** 导航项定义：供移动端底部导航与桌面侧栏共用 */
import type { ComponentType, SVGProps } from 'react'
import { t } from '@/i18n'
import { DiaryIcon, ForestIcon, FootprintsIcon, InteractIcon, StoryIcon } from './icons'

export interface MainNavItem {
  to: string
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}

/** 五个一级页面：森林 / 日记 / 故事 / 互动 / 足迹 */
export const mainNavItems: readonly MainNavItem[] = [
  { to: '/forest', label: t('nav.forest'), Icon: ForestIcon },
  { to: '/diary', label: t('nav.diary'), Icon: DiaryIcon },
  { to: '/story', label: t('nav.story'), Icon: StoryIcon },
  { to: '/interact', label: t('nav.interact'), Icon: InteractIcon },
  { to: '/footprints', label: t('nav.footprints'), Icon: FootprintsIcon },
]
