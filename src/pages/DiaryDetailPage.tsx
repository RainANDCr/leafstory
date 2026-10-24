/**
 * 日记详情：正文、照片（灯箱大图）、作者专属的编辑/删除。
 * 私密日记与草稿只有作者能到达这里（RLS 拦截无权者）。
 */
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { LoadingState } from '@/components/feedback/LoadingState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Lightbox } from '@/components/ui/Lightbox'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { getMood } from '@/features/diary/types'
import { useAuth } from '@/features/auth/AuthContext'
import { useCoupleSnapshot } from '@/features/couple/useCoupleSnapshot'
import { deleteDiary, getDiaryDetail } from '@/services/diaryService'
import { formatDateHuman } from '@/lib/dates'
import { t, zhCN } from '@/i18n'

export function DiaryDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { userId } = useAuth()
  const coupleQuery = useCoupleSnapshot()

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const detailQuery = useQuery({
    queryKey: ['diary', id],
    queryFn: () => getDiaryDetail(id as string),
    enabled: Boolean(id),
  })

  if (detailQuery.isLoading || coupleQuery.isLoading) return <LoadingState />
  if (detailQuery.isError || !detailQuery.data) return <ErrorState message={t('diary.errors.notFound')} />

  const { entry, mediaUrls, media } = detailQuery.data
  const mood = getMood(entry.mood)
  const isMine = entry.authorId === userId
  const authorName = coupleQuery.data?.info?.members.find((m) => m.userId === entry.authorId)?.nickname ?? '旅人'

  async function onDelete() {
    if (!id) return
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteDiary(entry.coupleId, id)
      void qc.invalidateQueries({ queryKey: ['diaries'] })
      void qc.invalidateQueries({ queryKey: ['sharedDiaries'] })
      navigate('/diary', { replace: true })
    } catch {
      setDeleteError(t('errors.unknown'))
      setDeleting(false)
      setConfirmOpen(false)
    }
  }

  return (
    <>
      <PageHeader
        title={entry.title || '无题'}
        description={`${zhCN.diary.authorBy(authorName)} · ${formatDateHuman(entry.happenedOn)}`}
        actions={
          isMine ? (
            <>
              <Link
                to={`/diary/${entry.id}/edit`}
                className="inline-flex min-h-11 items-center rounded-2xl border border-paper-edge bg-card px-4 text-sm text-bark transition-colors hover:bg-paper-deep"
              >
                {t('common.edit')}
              </Link>
              <Button className="bg-maple hover:bg-maple/85" onClick={() => setConfirmOpen(true)}>
                {t('common.delete')}
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="flex items-center gap-1.5 rounded-full border border-paper-edge bg-card px-3 py-1.5 text-bark">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: mood.color }} />
          {mood.label}
        </span>
        {entry.category ? (
          <span className="rounded-full border border-paper-edge bg-card px-3 py-1.5 text-bark-soft">{entry.category}</span>
        ) : null}
        {entry.status === 'draft' ? (
          <span className="rounded-full border border-leaf-gold/50 bg-leaf-gold/15 px-3 py-1.5 text-bark">{t('diary.draftBadge')}</span>
        ) : null}
        {entry.visibility === 'private' ? (
          <span className="rounded-full border border-paper-edge bg-paper-deep px-3 py-1.5 text-bark-soft">{t('diary.privateBadge')}</span>
        ) : null}
      </div>

      <article className="whitespace-pre-wrap rounded-card border border-paper-edge bg-card p-5 text-[15px] leading-8 text-bark shadow-soft">
        {entry.content}
      </article>

      {media.length > 0 ? (
        <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {mediaUrls.map((url, i) => (
            <li key={media[i]?.id ?? i} className="aspect-square overflow-hidden rounded-xl border border-paper-edge">
              <button type="button" className="h-full w-full" onClick={() => setLightboxIndex(i)} aria-label={zhCN.diary.photosCount(media.length)}>
                <img src={url} alt={media[i]?.fileName ?? ''} className="h-full w-full object-cover transition-transform hover:scale-105" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6">
        <Link to="/diary" className="text-sm text-bark-soft underline underline-offset-4">
          {t('diary.detailBack')}
        </Link>
      </div>

      {deleteError ? (
        <p role="alert" className="mt-4 rounded-2xl border border-maple/40 bg-maple/5 p-3 text-sm text-maple">
          {deleteError}
        </p>
      ) : null}

      {lightboxIndex !== null ? (
        <Lightbox
          images={mediaUrls.map((url, i) => ({ url, alt: media[i]?.fileName ?? '' }))}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title={t('diary.deleteConfirmTitle')}
        description={t('diary.deleteConfirmDesc')}
        confirmLabel={t('common.delete')}
        danger
        busy={deleting}
        onConfirm={() => void onDelete()}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}
