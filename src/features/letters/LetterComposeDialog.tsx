/** 写信：编写 → 预览 → 封存（封存后到期前不可改，只能撤回） */
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { formatUnlockTime, localInputToUTC } from './time'
import { zhCN } from '@/i18n'
import type { LetterRecipient } from '@/services/letterService'

interface LetterComposeDialogProps {
  open: boolean
  busy?: boolean
  onSubmit: (input: { recipient: LetterRecipient; unlockAt: string; title: string; body: string }) => void
  onCancel: () => void
}

export function LetterComposeDialog({ open, busy, onSubmit, onCancel }: LetterComposeDialogProps) {
  if (!open) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={zhCN.letters.write}
      className="fixed inset-0 z-50 flex items-end justify-center bg-bark-deep/40 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <ComposeForm busy={busy} onSubmit={onSubmit} onCancel={onCancel} />
    </div>
  )
}

function ComposeForm({
  busy,
  onSubmit,
  onCancel,
}: Pick<LetterComposeDialogProps, 'busy' | 'onSubmit' | 'onCancel'>) {
  const [step, setStep] = useState<'edit' | 'preview'>('edit')
  const [recipient, setRecipient] = useState<LetterRecipient>('partner')
  const [unlockLocal, setUnlockLocal] = useState(() => {
    // 默认：一年后的此刻
    const d = new Date()
    d.setFullYear(d.getFullYear() + 1)
    const pad = (n: number) => `${n}`.padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  })
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')

  function validate(): string | null {
    if (title.trim().length === 0) return zhCN.letters.errors.titleRequired
    if (body.trim().length === 0) return zhCN.letters.errors.bodyRequired
    const unlockMs = new Date(unlockLocal).getTime()
    if (Number.isNaN(unlockMs)) return zhCN.letters.errors.unlockPast
    if (unlockMs <= Date.now() + 60_000) return zhCN.letters.errors.unlockTooSoon
    return null
  }

  function toPreview() {
    const err = validate()
    setError(err ?? '')
    if (!err) setStep('preview')
  }

  const labelCls = 'block text-sm font-medium text-bark'
  const inputCls =
    'mt-1 w-full min-h-11 rounded-2xl border border-paper-edge bg-paper px-3.5 py-2 text-sm text-bark placeholder:text-bark-soft/60'

  return (
    <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-card border border-paper-edge bg-card p-5 shadow-lift sm:rounded-card">
      <h2 className="font-display text-lg text-bark">
        {step === 'edit' ? zhCN.letters.write : zhCN.letters.previewTitle}
      </h2>

      {step === 'edit' ? (
        <div className="mt-4 space-y-4">
          {/* 收件人 */}
          <fieldset>
            <legend className={labelCls}>{zhCN.letters.whoLabel}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['partner', zhCN.letters.recipientPartner, zhCN.letters.recipientPartnerDesc],
                  ['both', zhCN.letters.recipientBoth, zhCN.letters.recipientBothDesc],
                ] as ReadonlyArray<readonly [LetterRecipient, string, string]>
              ).map(([value, label, desc]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={recipient === value}
                  onClick={() => setRecipient(value)}
                  className={`rounded-2xl border p-3.5 text-left transition-colors ${
                    recipient === value ? 'border-bark bg-bark/5' : 'border-paper-edge hover:bg-paper-deep/50'
                  }`}
                >
                  <span className="block text-sm font-medium text-bark">{label}</span>
                  <span className="mt-0.5 block text-xs text-bark-soft">{desc}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label className={labelCls} htmlFor="letter-unlock">
              {zhCN.letters.fieldUnlock}
            </label>
            <input
              id="letter-unlock"
              type="datetime-local"
              className={inputCls}
              value={unlockLocal}
              onChange={(e) => setUnlockLocal(e.target.value)}
            />
            <p className="mt-1 text-xs text-bark-soft">{zhCN.letters.unlockHint}</p>
          </div>

          <div>
            <label className={labelCls} htmlFor="letter-title">
              {zhCN.letters.fieldTitle}
            </label>
            <input
              id="letter-title"
              className={inputCls}
              maxLength={80}
              placeholder={zhCN.letters.titlePlaceholder}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className={labelCls} htmlFor="letter-body">
              {zhCN.letters.fieldBody}
            </label>
            <textarea
              id="letter-body"
              className={`${inputCls} min-h-40 leading-7`}
              maxLength={10000}
              placeholder={zhCN.letters.bodyPlaceholder}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          {error ? <p role="alert" className="text-sm text-maple">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>
              {zhCN.common.cancel}
            </Button>
            <Button onClick={toPreview}>{zhCN.letters.previewTitle}</Button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          {/* 信纸预览 */}
          <div className="rounded-card border border-paper-edge bg-paper p-5 shadow-soft">
            <p className="text-xs text-bark-soft">
              {recipient === 'partner' ? zhCN.letters.recipientPartner : zhCN.letters.recipientBoth} ·{' '}
              {zhCN.letters.unlockAtLabel}：{formatUnlockTime(localInputToUTC(unlockLocal))}
            </p>
            <h3 className="mt-2 font-display text-xl text-bark">{title}</h3>
            <div className="mt-3 whitespace-pre-wrap text-[15px] leading-8 text-bark">{body}</div>
          </div>
          <p className="mt-3 text-xs leading-5 text-bark-soft">{zhCN.letters.sealHint}</p>

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setStep('edit')}>
              {zhCN.common.edit}
            </Button>
            <Button disabled={busy} onClick={() => onSubmit({ recipient, unlockAt: localInputToUTC(unlockLocal), title, body })}>
              {busy ? zhCN.common.saving : zhCN.letters.sealAction}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
