import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { t } from '@/i18n'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** 二次确认对话框：删除等高风险操作必须使用 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  // 打开时把焦点放到「取消」，键盘用户不会误按确认
  useEffect(() => {
    if (open) cancelRef.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-bark-deep/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="w-full max-w-sm rounded-card border border-paper-edge bg-card p-5 shadow-lift">
        <h2 className="font-display text-lg text-bark">{title}</h2>
        {description ? <p className="mt-2 text-sm leading-6 text-bark-soft">{description}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <span ref={cancelRef}>
            <Button variant="ghost" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
          </span>
          <Button className={danger ? 'bg-maple hover:bg-maple/85' : ''} onClick={onConfirm} disabled={busy}>
            {busy ? t('common.saving') : (confirmLabel ?? t('common.confirm'))}
          </Button>
        </div>
      </div>
    </div>
  )
}
