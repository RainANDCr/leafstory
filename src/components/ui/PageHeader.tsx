import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  /** 标题右侧的操作区 */
  actions?: ReactNode
}

/** 统一的页面标题区：衬线标题 + 说明 + 操作 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl tracking-wide text-bark">{title}</h1>
        {description ? <p className="mt-1.5 max-w-prose text-sm leading-6 text-bark-soft">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}
