/**
 * 原创手绘风 SVG 图标集（导航与通用）。
 * 线性描边风格，统一 1.8 描边宽度、圆角端点；不使用任何第三方图标库或受版权素材。
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function IconBase({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

/** 森林：一棵小树 */
export function ForestIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3 8 9.5h2.2L6.2 15.5h4.6V20h2.4v-4.5h4.6l-4-6h2.2L12 3Z" />
    </IconBase>
  )
}

/** 日记：合上的本子与笔 */
export function DiaryIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="5" y="4" width="14" height="16" rx="2.5" />
      <path d="M9 4v16" />
      <path d="M12.5 8.5H16M12.5 12H16" />
    </IconBase>
  )
}

/** 故事：翻开的书 */
export function StoryIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 6.5C10.4 5 8.4 4.5 5.5 4.5v13c2.9 0 4.9.5 6.5 2 1.6-1.5 3.6-2 6.5-2v-13c-2.9 0-4.9.5-6.5 2Z" />
      <path d="M12 6.5v13" />
    </IconBase>
  )
}

/** 互动：心 */
export function InteractIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 20C6.5 15.5 4 12.3 4 9.3 4 6.9 5.9 5 8.2 5c1.6 0 3 .9 3.8 2.3C12.8 5.9 14.2 5 15.8 5 18.1 5 20 6.9 20 9.3c0 3-2.5 6.2-8 10.7Z" />
    </IconBase>
  )
}

/** 足迹：地图标记 */
export function FootprintsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 21s-7-6.3-7-11.2C5 6.4 8.1 3.5 12 3.5s7 2.9 7 6.3C19 14.7 12 21 12 21Z" />
      <circle cx="12" cy="9.7" r="2.4" />
    </IconBase>
  )
}

/** 设置：简洁齿轮 */
export function SettingsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v2.2M12 18.8V21M4.2 7.5l1.9 1.1M17.9 15.4l1.9 1.1M4.2 16.5l1.9-1.1M17.9 8.6l1.9-1.1" />
    </IconBase>
  )
}

/** 信件：时光邮局 */
export function MailIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="4" y="5.5" width="16" height="13" rx="2.5" />
      <path d="m6.5 8.5 5.5 4.5 5.5-4.5" />
    </IconBase>
  )
}

/** 落叶：单片叶子（空状态等） */
export function LeafIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 18C6 10 12 5 19 5c0 8-5 13-13 13Z" />
      <path d="M6 18c2.5-4.5 6-7.5 10-9.5" />
    </IconBase>
  )
}
