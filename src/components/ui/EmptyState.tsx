import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  /** 底部操作区（按钮等） */
  action?: ReactNode
}

/**
 * 空状态：虚线纸面卡片，克制的插画位 + 文案 + 可选操作。
 * 用于各页面尚未开放或暂无数据的场景，禁止伪造“真实数据”。
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-card border border-dashed border-paper-edge bg-paper/70 px-6 py-10 text-center">
      {icon ? (
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-leaf-gold/15 text-leaf-gold">
          {icon}
        </div>
      ) : null}
      <h2 className="font-display text-lg text-bark">{title}</h2>
      {description ? <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-bark-soft">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  )
}
