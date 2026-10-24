/** 加载态：给屏幕阅读器与视觉用户统一的“正在加载”提示 */
export function LoadingState({ label = '正在加载…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center py-10 text-sm text-bark-soft">
      <span aria-hidden="true" className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-leaf-gold" />
      {label}
    </div>
  )
}
