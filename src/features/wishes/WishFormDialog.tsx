/** 心愿新建/编辑表单（挂载时经 key 初始化） */
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { zhCN } from '@/i18n'
import type { WishInput, WishPriority } from '@/services/wishService'
import type { Wish } from '@/services/wishService'

interface WishFormDialogProps {
  open: boolean
  initial?: Wish | null
  busy?: boolean
  onSubmit: (input: WishInput) => void
  onCancel: () => void
}

const PRIORITIES: ReadonlyArray<readonly [WishPriority, string]> = [
  ['high', zhCN.wishes.priorityHigh],
  ['normal', zhCN.wishes.priorityNormal],
  ['low', zhCN.wishes.priorityLow],
]

export function WishFormDialog({ open, initial, busy, onSubmit, onCancel }: WishFormDialogProps) {
  if (!open) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={initial ? zhCN.wishes.editWish : zhCN.wishes.newWish}
      className="fixed inset-0 z-50 flex items-end justify-center bg-bark-deep/40 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <WishForm key={initial?.id ?? 'new'} initial={initial} busy={busy} onSubmit={onSubmit} onCancel={onCancel} />
    </div>
  )
}

function WishForm({ initial, busy, onSubmit, onCancel }: Omit<WishFormDialogProps, 'open'> & { initial?: Wish | null }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '')
  const [priority, setPriority] = useState<WishPriority>(initial?.priority ?? 'normal')
  const [placeNote, setPlaceNote] = useState(initial?.placeNote ?? '')
  const [error, setError] = useState('')

  function submit() {
    if (title.trim().length === 0) {
      setError(zhCN.wishes.errors.titleRequired)
      return
    }
    onSubmit({
      title,
      description: description.trim() || null,
      dueDate: dueDate || null,
      priority,
      placeNote: placeNote.trim() || null,
    })
  }

  const labelCls = 'block text-sm font-medium text-bark'
  const inputCls =
    'mt-1 w-full min-h-11 rounded-2xl border border-paper-edge bg-paper px-3.5 py-2 text-sm text-bark placeholder:text-bark-soft/60'

  return (
    <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-card border border-paper-edge bg-card p-5 shadow-lift sm:rounded-card">
      <h2 className="font-display text-lg text-bark">{initial ? zhCN.wishes.editWish : zhCN.wishes.newWish}</h2>

      <div className="mt-4 space-y-4">
        <div>
          <label className={labelCls} htmlFor="wish-title">
            {zhCN.wishes.fieldTitle}
          </label>
          <input
            id="wish-title"
            className={inputCls}
            value={title}
            maxLength={80}
            placeholder={zhCN.wishes.titlePlaceholder}
            onChange={(e) => setTitle(e.target.value)}
          />
          {error ? <p className="mt-1 text-xs text-maple">{error}</p> : null}
        </div>

        <div>
          <label className={labelCls} htmlFor="wish-desc">
            {zhCN.wishes.fieldDesc}
          </label>
          <textarea
            id="wish-desc"
            className={`${inputCls} min-h-20`}
            maxLength={1000}
            placeholder={zhCN.wishes.descPlaceholder}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="wish-due">
              {zhCN.wishes.fieldDue}
            </label>
            <input id="wish-due" type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="wish-priority">
              {zhCN.wishes.fieldPriority}
            </label>
            <select
              id="wish-priority"
              className={inputCls}
              value={priority}
              onChange={(e) => setPriority(e.target.value as WishPriority)}
            >
              {PRIORITIES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="wish-place">
            {zhCN.wishes.fieldPlace}
          </label>
          <input
            id="wish-place"
            className={inputCls}
            maxLength={120}
            placeholder={zhCN.wishes.placePlaceholder}
            value={placeNote}
            onChange={(e) => setPlaceNote(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {zhCN.common.cancel}
        </Button>
        <Button onClick={submit} disabled={busy}>
          {busy ? zhCN.common.saving : zhCN.common.save}
        </Button>
      </div>
    </div>
  )
}
