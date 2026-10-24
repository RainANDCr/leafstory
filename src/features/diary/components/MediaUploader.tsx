/**
 * 照片选择与预览（受控组件，状态由编辑器页面持有）。
 * 限制（数量/大小/类型）的校验在页面层完成并给出提示。
 */
import { useEffect } from 'react'
import { t } from '@/i18n'
import { MAX_MEDIA_PER_ENTRY } from '@/lib/image'

export interface ExistingMediaView {
  id: string
  url: string
  fileName: string
}

interface MediaUploaderProps {
  newFiles: File[]
  previews: string[]
  onAdd: (files: File[]) => void
  onRemoveNew: (index: number) => void
  existingMedia: ExistingMediaView[]
  onRemoveExisting: (id: string) => void
  disabled?: boolean
}

export function MediaUploader({
  newFiles,
  previews,
  onAdd,
  onRemoveNew,
  existingMedia,
  onRemoveExisting,
  disabled,
}: MediaUploaderProps) {
  // 组件卸载时释放预览 URL
  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url))
    }
    // 仅在卸载时清理；previews 变更由页面在移除单项时单独释放
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const total = existingMedia.length + newFiles.length

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-bark-soft">{t('diary.mediaHint')}</p>
        <label className="inline-flex min-h-9 cursor-pointer items-center rounded-xl border border-paper-edge bg-card px-3 text-xs font-medium text-bark transition-colors hover:bg-paper-deep">
          {t('diary.mediaAdd')}
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={disabled || total >= MAX_MEDIA_PER_ENTRY}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              e.target.value = ''
              if (files.length > 0) onAdd(files)
            }}
          />
        </label>
      </div>

      {total > 0 ? (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {existingMedia.map((m) => (
            <li key={m.id} className="group relative aspect-square overflow-hidden rounded-xl border border-paper-edge">
              <img src={m.url} alt={m.fileName} className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label={`${t('common.delete')} ${m.fileName}`}
                disabled={disabled}
                onClick={() => onRemoveExisting(m.id)}
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-bark-deep/70 text-sm text-paper"
              >
                ×
              </button>
            </li>
          ))}
          {previews.map((url, i) => (
            <li key={url} className="relative aspect-square overflow-hidden rounded-xl border border-paper-edge">
              <img src={url} alt={newFiles[i]?.name ?? ''} className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label={`${t('common.delete')} ${newFiles[i]?.name ?? ''}`}
                disabled={disabled}
                onClick={() => onRemoveNew(i)}
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-bark-deep/70 text-sm text-paper"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
