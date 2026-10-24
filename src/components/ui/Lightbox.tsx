import { useCallback, useEffect } from 'react'

export interface LightboxImage {
  url: string
  alt: string
}

interface LightboxProps {
  images: LightboxImage[]
  index: number
  onClose: () => void
  onNavigate: (index: number) => void
}

/** 查看大图：遮罩层 + 左右切换，支持 Esc / 方向键 */
export function Lightbox({ images, index, onClose, onNavigate }: LightboxProps) {
  const total = images.length

  const go = useCallback(
    (delta: number) => {
      if (total === 0) return
      onNavigate((index + delta + total) % total)
    },
    [index, onNavigate, total],
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  if (total === 0) return null
  const current = images[index]!
  const showArrows = total > 1

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={current.alt}
      className="fixed inset-0 z-50 flex items-center justify-center bg-bark-deep/85 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-paper/15 text-2xl text-paper"
      >
        ×
      </button>
      {showArrows ? (
        <button
          type="button"
          aria-label="上一张"
          onClick={() => go(-1)}
          className="absolute left-2 flex h-12 w-12 items-center justify-center rounded-full bg-paper/15 text-2xl text-paper sm:left-6"
        >
          ‹
        </button>
      ) : null}
      <img
        src={current.url}
        alt={current.alt}
        className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-lift"
      />
      {showArrows ? (
        <button
          type="button"
          aria-label="下一张"
          onClick={() => go(1)}
          className="absolute right-2 flex h-12 w-12 items-center justify-center rounded-full bg-paper/15 text-2xl text-paper sm:right-6"
        >
          ›
        </button>
      ) : null}
      {total > 1 ? (
        <p className="absolute bottom-4 rounded-full bg-paper/15 px-3 py-1 text-xs text-paper">
          {index + 1} / {total}
        </p>
      ) : null}
    </div>
  )
}
