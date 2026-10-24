/**
 * 愿望完成的「落叶落地」轻动效：
 * 一片金色叶子从上飘落 + 提示文案，约 2.6 秒后自动消失；
 * 父组件通过 key 变化重新挂载以重复播放；
 * prefers-reduced-motion 下由全局规则降级为静态提示。
 */
import { useEffect, useState } from 'react'
import { zhCN } from '@/i18n'

export function FallingLeafToast() {
  const [show, setShow] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setShow(false), 2600)
    return () => clearTimeout(timer)
  }, [])

  if (!show) return null

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-4">
      <div className="relative flex items-center gap-3 rounded-card border border-leaf-gold/50 bg-card px-5 py-3 shadow-lift">
        <span aria-hidden="true" className="leaf-fall inline-block text-2xl">
          🍂
        </span>
        <span className="text-sm font-medium text-bark">{zhCN.wishes.completeToast}</span>
      </div>
    </div>
  )
}
