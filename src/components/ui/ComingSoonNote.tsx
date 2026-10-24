import { LeafIcon } from '@/components/layout/icons'

/**
 * 阶段未开放的说明卡：诚实告知功能将在哪个开发阶段开放，
 * 不放可点击但无效的假按钮。
 */
export function ComingSoonNote({ note }: { note: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-leaf-gold/35 bg-leaf-gold/10 p-4 text-sm leading-6 text-bark">
      <LeafIcon className="mt-0.5 h-5 w-5 shrink-0 text-leaf-gold" />
      <p>{note}</p>
    </div>
  )
}
