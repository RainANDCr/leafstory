/** 心愿绑定日记：把「未来的计划」沉淀成「过去的故事」；解绑不影响日记 */
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { getMood, type DiaryEntry } from '@/features/diary/types'
import { formatDateShort } from '@/lib/dates'
import { zhCN } from '@/i18n'

interface WishLinkDialogProps {
  open: boolean
  /** 可绑定的日记（当前用户可见的共享已发布） */
  entries: readonly DiaryEntry[]
  busy?: boolean
  onSubmit: (diaryEntryId: string | null) => void
  onCancel: () => void
}

export function WishLinkDialog({ open, entries, busy, onSubmit, onCancel }: WishLinkDialogProps) {
  const [selected, setSelected] = useState<string | null>(null)
  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={zhCN.wishes.chooseDiary}
      className="fixed inset-0 z-50 flex items-end justify-center bg-bark-deep/40 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-card border border-paper-edge bg-card p-5 shadow-lift sm:rounded-card">
        <h2 className="font-display text-lg text-bark">{zhCN.wishes.chooseDiary}</h2>

        {entries.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-paper-deep p-3 text-sm text-bark-soft">{zhCN.wishes.noDiaries}</p>
        ) : (
          <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto">
            {entries.map((e) => (
              <li key={e.id}>
                <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1 text-sm text-bark hover:bg-paper-deep">
                  <input
                    type="radio"
                    name="wish-link-entry"
                    className="h-4 w-4 accent-bark"
                    checked={selected === e.id}
                    onChange={() => setSelected(e.id)}
                  />
                  <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getMood(e.mood).color }} />
                  <span className="text-xs text-bark-soft">{formatDateShort(e.happenedOn)}</span>
                  <span className="truncate">{e.title || '无题'}</span>
                </label>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {zhCN.common.cancel}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => onSubmit(null)}>
            {zhCN.wishes.unbind}
          </Button>
          <Button disabled={busy || !selected} onClick={() => onSubmit(selected)}>
            {busy ? zhCN.common.saving : zhCN.common.confirm}
          </Button>
        </div>
      </div>
    </div>
  )
}
