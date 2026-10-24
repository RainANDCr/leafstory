/** 开启后的信件阅读视图：信纸样式，仅在服务端校验通过后渲染 */
import { useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { formatUnlockTime } from './time'
import { zhCN } from '@/i18n'
import type { LetterContent } from '@/services/letterService'

interface LetterReadDialogProps {
  open: boolean
  letter: LetterContent | null
  /** 展示寄件人昵称 */
  authorName: string
  onClose: () => void
}

export function LetterReadDialog({ open, letter, authorName, onClose }: LetterReadDialogProps) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !letter) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={letter.title}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-bark-deep/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="my-8 w-full max-w-lg rounded-card border border-paper-edge bg-paper p-6 shadow-lift sm:p-8">
        <p className="text-xs text-leaf-gold">✦ {zhCN.letters.unsealTitle}</p>
        <p className="mt-1 text-xs text-bark-soft">
          {zhCN.letters.fromWho(authorName)} · {zhCN.letters.unlockAtLabel}：{formatUnlockTime(letter.unlockAt)}
        </p>
        <h2 className="mt-3 font-display text-2xl text-bark">{letter.title}</h2>
        <div className="mt-4 whitespace-pre-wrap text-[15px] leading-8 text-bark">{letter.body}</div>
        <div className="mt-6 text-right">
          <Button onClick={onClose}>{zhCN.common.confirm}</Button>
        </div>
      </div>
    </div>
  )
}
