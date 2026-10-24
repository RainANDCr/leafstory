/**
 * 足迹页：纪念日管理（阶段 1）+ 地图占位（阶段 4）。
 * 倒计时按本地日历日计算；相识/在一起/第一次约会为金叶纪念日。
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { AnniversaryFormDialog } from '@/features/anniversaries/AnniversaryFormDialog'
import {
  countdownText,
  isGoldKind,
  kindLabel,
  nextAnniversary,
  sortForDisplay,
  withCountdown,
} from '@/features/anniversaries/ui'
import { useCoupleSnapshot } from '@/features/couple/useCoupleSnapshot'
import { useAuth } from '@/features/auth/AuthContext'
import {
  createAnniversary,
  deleteAnniversary,
  listAnniversaries,
  updateAnniversary,
  type Anniversary,
  type AnniversaryInput,
} from '@/services/anniversaryService'
import { FootprintsIcon, LeafIcon } from '@/components/layout/icons'
import { formatDateHuman } from '@/lib/dates'
import { getErrorMessage } from '@/lib/errors'
import { t } from '@/i18n'

export function FootprintsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const coupleQuery = useCoupleSnapshot()
  const { userId } = useAuth()
  const couple = coupleQuery.data?.info ?? null

  const listQuery = useQuery({
    queryKey: ['anniversaries', couple?.coupleId],
    queryFn: () => listAnniversaries(couple!.coupleId),
    enabled: Boolean(couple?.coupleId),
  })

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Anniversary | null>(null)
  const [deleting, setDeleting] = useState<Anniversary | null>(null)
  const [actionError, setActionError] = useState('')

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['anniversaries'] })
    void qc.invalidateQueries({ queryKey: ['nextAnniversary'] })
  }

  const saveMutation = useMutation({
    mutationFn: async (input: AnniversaryInput) => {
      if (!couple) throw new Error('未配对')
      if (editing) await updateAnniversary(editing.id, input)
      else await createAnniversary(couple.coupleId, userId ?? '', input)
    },
    onSuccess: () => {
      setFormOpen(false)
      setEditing(null)
      setActionError('')
      invalidate()
    },
    onError: (err) => setActionError(getErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (target: Anniversary) => deleteAnniversary(target.id),
    onSuccess: () => {
      setDeleting(null)
      setActionError('')
      invalidate()
    },
    onError: (err) => {
      setActionError(getErrorMessage(err))
      setDeleting(null)
    },
  })

  if (coupleQuery.isLoading) return <LoadingState />
  if (coupleQuery.isError) {
    return <ErrorState message={getErrorMessage(coupleQuery.error)} onRetry={() => void qc.invalidateQueries({ queryKey: ['couple'] })} />
  }

  if (!couple) {
    return (
      <>
        <PageHeader title={t('footprints.title')} description={t('footprints.intro')} />
        <EmptyState
          icon={<LeafIcon className="h-6 w-6" />}
          title={t('forest.needPairing')}
          description={t('forest.needPairingDesc')}
          action={<Button onClick={() => navigate('/pairing')}>{t('forest.goPairing')}</Button>}
        />
      </>
    )
  }

  const items = withCountdown(listQuery.data ?? [])
  const sorted = sortForDisplay(items)
  const next = nextAnniversary(items)

  return (
    <>
      <PageHeader title={t('footprints.title')} description={t('footprints.intro')} />

      {/* 地图占位：阶段 4 */}
      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-medium text-bark-soft">{t('footprints.mapTitle')}</h2>
        <div className="flex h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-paper-edge bg-gradient-to-b from-paper-deep to-paper">
          <FootprintsIcon className="mb-3 h-8 w-8 text-leaf-gold" />
          <p className="font-display text-base text-bark">{t('footprints.mapPlaceholder')}</p>
          <p className="mt-1.5 max-w-xs text-center text-xs leading-5 text-bark-soft">{t('footprints.mapTeaser')}</p>
        </div>
      </Card>

      {/* 纪念日 */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-bark-soft">{t('footprints.anniversariesTitle')}</h2>
          <Button
            variant="secondary"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            {t('anniversaries.add')}
          </Button>
        </div>

        {next ? (
          <div className="mb-4 rounded-2xl border border-leaf-gold/40 bg-leaf-gold/10 p-4">
            <p className="text-xs text-bark-soft">{t('anniversaries.nextLabel')}</p>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <p className="font-display text-base text-bark">{next.title}</p>
              <p className="text-sm font-medium text-bark">{countdownText(next)}</p>
            </div>
          </div>
        ) : null}

        {listQuery.isError ? (
          <ErrorState message={getErrorMessage(listQuery.error)} onRetry={() => void listQuery.refetch()} />
        ) : listQuery.isLoading ? (
          <LoadingState />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={<LeafIcon className="h-6 w-6" />}
            title={t('anniversaries.emptyTitle')}
            description={t('anniversaries.emptyDesc')}
          />
        ) : (
          <ul className="space-y-3">
            {sorted.map((item) => (
              <li
                key={item.id}
                className={`flex items-start justify-between gap-3 rounded-2xl border bg-card p-4 ${
                  isGoldKind(item.kind) ? 'border-leaf-gold/50' : 'border-paper-edge'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-base text-bark">{item.title}</h3>
                    <span className="rounded-full border border-paper-edge bg-paper-deep px-2 py-0.5 text-[11px] text-bark-soft">
                      {kindLabel(item.kind)}
                    </span>
                    {isGoldKind(item.kind) ? (
                      <span title={t('anniversaries.goldKindHint')} aria-label={t('anniversaries.goldKindHint')}>
                        <LeafIcon className="h-4 w-4 text-leaf-gold" />
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-bark-soft">
                    {formatDateHuman(item.anniversaryDate)}
                    {item.repeatsYearly ? ` · ${t('anniversaries.repeatYearly')}` : ''}
                  </p>
                  {item.note ? <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-bark-soft">{item.note}</p> : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs ${
                      item.countdown.status === 'today'
                        ? 'bg-leaf-gold/20 font-medium text-bark'
                        : 'bg-paper-deep text-bark-soft'
                    }`}
                  >
                    {countdownText(item)}
                  </span>
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      className="text-bark-soft underline underline-offset-2 hover:text-bark"
                      onClick={() => {
                        setEditing(item)
                        setFormOpen(true)
                      }}
                    >
                      {t('common.edit')}
                    </button>
                    <button type="button" className="text-maple underline underline-offset-2" onClick={() => setDeleting(item)}>
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {actionError ? (
          <p role="alert" className="mt-4 rounded-2xl border border-maple/40 bg-maple/5 p-3 text-sm text-maple">
            {actionError}
          </p>
        ) : null}
      </Card>

      <AnniversaryFormDialog
        open={formOpen}
        initial={editing}
        busy={saveMutation.isPending}
        onSubmit={(input) => saveMutation.mutate(input)}
        onCancel={() => {
          setFormOpen(false)
          setEditing(null)
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={t('anniversaries.title')}
        description={`「${deleting?.title ?? ''}」${t('common.confirmDeleteNoUndo')}`}
        confirmLabel={t('common.delete')}
        danger
        busy={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}
