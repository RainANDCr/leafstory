import { useState } from 'react'
import { t } from '@/i18n'

/** 复制到剪贴板的小按钮（邀请码等场景） */
export function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // 剪贴板 API 不可用时的降级：选中文本让用户手动复制
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`min-h-9 rounded-xl bg-bark px-3 text-xs font-medium text-paper transition-colors hover:bg-bark-deep ${className}`}
    >
      {copied ? t('common.copied') : t('common.copy')}
    </button>
  )
}
