import { Button } from '@/components/ui/Button'

interface ErrorStateProps {
  /** 已经过安全化的用户可读文案（不要传入原始错误对象） */
  message?: string
  onRetry?: () => void
}

/** 错误态：明确的失败提示 + 可选重试 */
export function ErrorState({ message = '出了点小问题，请稍后再试。', onRetry }: ErrorStateProps) {
  return (
    <div role="alert" className="rounded-card border border-maple/40 bg-maple/5 px-6 py-8 text-center">
      <p className="text-sm leading-6 text-bark">{message}</p>
      {onRetry ? (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={onRetry}>
            重试
          </Button>
        </div>
      ) : null}
    </div>
  )
}
