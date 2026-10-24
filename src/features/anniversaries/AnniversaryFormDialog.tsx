/** 纪念日新建/编辑表单对话框（打开时经 key 重挂载初始化，避免 effect 同步状态） */
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { toISODate } from '@/lib/dates'
import { zhCN } from '@/i18n'
import type { Anniversary, AnniversaryInput, AnniversaryKind } from '@/services/anniversaryService'

const KINDS: AnniversaryKind[] = ['met', 'together', 'birthday', 'first_date', 'custom']

interface AnniversaryFormDialogProps {
  open: boolean
  initial?: Anniversary | null
  busy?: boolean
  onSubmit: (input: AnniversaryInput) => void
  onCancel: () => void
}

export function AnniversaryFormDialog({ open, initial, busy, onSubmit, onCancel }: AnniversaryFormDialogProps) {
  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={initial ? zhCN.anniversaries.edit : zhCN.anniversaries.add}
      className="fixed inset-0 z-50 flex items-end justify-center bg-bark-deep/40 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <AnniversaryForm key={initial?.id ?? 'new'} initial={initial} busy={busy} onSubmit={onSubmit} onCancel={onCancel} />
    </div>
  )
}

function AnniversaryForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: Omit<AnniversaryFormDialogProps, 'open'> & { initial?: Anniversary | null }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [kind, setKind] = useState<AnniversaryKind>(initial?.kind ?? 'custom')
  const [date, setDate] = useState(initial?.anniversaryDate ?? toISODate())
  const [repeatsYearly, setRepeatsYearly] = useState(initial?.repeatsYearly ?? true)
  const [note, setNote] = useState(initial?.note ?? '')
  const [errors, setErrors] = useState<{ title?: string; date?: string }>({})

  function submit() {
    const next: typeof errors = {}
    if (title.trim().length === 0) next.title = zhCN.anniversaries.errors.titleRequired
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) next.date = zhCN.anniversaries.errors.dateInvalid
    setErrors(next)
    if (Object.keys(next).length > 0) return
    onSubmit({ title, kind, anniversaryDate: date, repeatsYearly, note })
  }

  const labelCls = 'block text-sm font-medium text-bark'
  const inputCls =
    'mt-1 w-full min-h-11 rounded-2xl border border-paper-edge bg-paper px-3.5 py-2 text-sm text-bark placeholder:text-bark-soft/60'

  return (
    <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-card border border-paper-edge bg-card p-5 shadow-lift sm:rounded-card">
      <h2 className="font-display text-lg text-bark">{initial ? zhCN.anniversaries.edit : zhCN.anniversaries.add}</h2>

      <div className="mt-4 space-y-4">
        <div>
          <label className={labelCls} htmlFor="ann-title">
            {zhCN.anniversaries.fieldTitle}
          </label>
          <input
            id="ann-title"
            className={inputCls}
            value={title}
            maxLength={60}
            placeholder={zhCN.anniversaries.titlePlaceholder}
            onChange={(e) => setTitle(e.target.value)}
          />
          {errors.title ? <p className="mt-1 text-xs text-maple">{errors.title}</p> : null}
        </div>

        <div>
          <label className={labelCls} htmlFor="ann-kind">
            {zhCN.anniversaries.fieldKind}
          </label>
          <select
            id="ann-kind"
            className={inputCls}
            value={kind}
            onChange={(e) => setKind(e.target.value as AnniversaryKind)}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {zhCN.anniversaries.kinds[k]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls} htmlFor="ann-date">
            {zhCN.anniversaries.fieldDate}
          </label>
          <input id="ann-date" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          {errors.date ? <p className="mt-1 text-xs text-maple">{errors.date}</p> : null}
        </div>

        <div className="flex items-center gap-3">
          <input
            id="ann-repeat"
            type="checkbox"
            className="h-4.5 w-4.5 accent-bark"
            checked={repeatsYearly}
            onChange={(e) => setRepeatsYearly(e.target.checked)}
          />
          <label htmlFor="ann-repeat" className="text-sm text-bark">
            {repeatsYearly ? zhCN.anniversaries.repeatYearly : zhCN.anniversaries.onceOnly}
          </label>
        </div>

        <div>
          <label className={labelCls} htmlFor="ann-note">
            {zhCN.anniversaries.fieldNote}
          </label>
          <textarea
            id="ann-note"
            className={`${inputCls} min-h-20`}
            maxLength={500}
            placeholder={zhCN.anniversaries.notePlaceholder}
            value={note}
            onChange={(e) => setNote(e.target.value)}
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
