/** 打印壳：无导航的 A4 友好页面，带「打印」按钮（打印时自动隐藏） */
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { zhCN } from '@/i18n'

export function PrintShell({ title, children }: { title: string; children: ReactNode }) {
  const navigate = useNavigate()
  return (
    <div className="print-page mx-auto w-full max-w-3xl px-4 py-6 lg:px-8">
      <div className="no-print mb-5 flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          ‹ {zhCN.print.back}
        </Button>
        <Button onClick={() => window.print()}>🖨 {zhCN.print.action}</Button>
      </div>
      <h1 className="mb-1 font-display text-2xl tracking-wide text-bark">{title}</h1>
      <p className="mb-6 text-xs text-bark-soft">{zhCN.print.footer}</p>
      {children}
    </div>
  )
}
