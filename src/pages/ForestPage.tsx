/**
 * 森林首页（阶段 1）：真实数据驱动的回忆之树。
 * - 叶片来自「双方可见且已发布」的日记（私密日记不进入共享树）；
 * - 叶子数量只是记录的痕迹，不与感情评价挂钩；
 * - 未配对时引导去配对页。
 */
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { LoadingState } from '@/components/feedback/LoadingState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LeafIcon } from '@/components/layout/icons'
import { MemoryTree } from '@/features/forest/components/MemoryTree'
import { MonkeyMascot } from '@/components/MonkeyMascot'
import { dailyPrompt } from '@/features/forest/dailyPrompt'
import { DiaryCard } from '@/features/diary/components/DiaryCard'
import { countdownText, kindLabel, nextAnniversary, withCountdown } from '@/features/anniversaries/ui'
import { useCoupleSnapshot } from '@/features/couple/useCoupleSnapshot'
import { listSharedDiariesForTree } from '@/services/diaryService'
import { listAnniversaries } from '@/services/anniversaryService'
import { getErrorMessage } from '@/lib/errors'
import { t, zhCN } from '@/i18n'

export function ForestPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const coupleQuery = useCoupleSnapshot()
  const coupleId = coupleQuery.data?.info?.coupleId ?? null

  const diariesQuery = useQuery({
    queryKey: ['sharedDiaries', coupleId],
    queryFn: () => listSharedDiariesForTree(),
    enabled: Boolean(coupleId),
    staleTime: 60_000,
  })

  const anniversariesQuery = useQuery({
    queryKey: ['anniversaries', coupleId],
    queryFn: () => listAnniversaries(coupleId!),
    enabled: Boolean(coupleId),
  })

  if (coupleQuery.isLoading) return <LoadingState />
  if (coupleQuery.isError) {
    return <ErrorState message={getErrorMessage(coupleQuery.error)} onRetry={() => void qc.invalidateQueries({ queryKey: ['couple'] })} />
  }

  // 未配对：引导配对，不展示假树数据
  if (!coupleId) {
    return (
      <>
        <PageHeader title={t('forest.title')} description={t('forest.intro')} />
        <EmptyState
          icon={<LeafIcon className="h-6 w-6" />}
          title={t('forest.needPairing')}
          description={t('forest.needPairingDesc')}
          action={<Button onClick={() => navigate('/pairing')}>{t('forest.goPairing')}</Button>}
        />
      </>
    )
  }

  const entries = diariesQuery.data ?? []
  const recent = entries.slice(0, 5)
  const leaves = recent.concat(entries.slice(5)).slice(0, 24)
  const members = coupleQuery.data?.info?.members ?? []
  const authorName = (authorId: string) => members.find((m) => m.userId === authorId)?.nickname ?? '旅人'

  const anniversaries = withCountdown(anniversariesQuery.data ?? [])
  const next = nextAnniversary(anniversaries)

  return (
    <>
      <PageHeader title={t('forest.title')} description={t('forest.intro')} />

      {/* 回忆之树 */}
      <div className="relative mb-2">
        <MemoryTree
          className="mx-auto w-full max-w-sm"
          leaves={leaves.map((e) => ({ id: e.id, mood: e.mood, title: e.title }))}
        />
        <MonkeyMascot className="absolute bottom-2 left-1 w-20 sm:w-24" />
      </div>
      <p className="mb-1 text-center font-display text-lg text-bark">{t('app.tagline')}</p>
      {entries.length > 0 ? (
        <p className="mb-6 text-center text-xs text-bark-soft">
          {zhCN.forest.leafCount(entries.length)} · {t('forest.leafCountHint')}
        </p>
      ) : (
        <p className="mb-6" />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="mb-1.5 text-sm font-medium text-bark-soft">{t('forest.todayHintTitle')}</h2>
          <p className="leading-7 text-bark">{dailyPrompt()}</p>
        </Card>

        <Card>
          <h2 className="mb-1.5 text-sm font-medium text-bark-soft">{t('forest.nextAnniversaryTitle')}</h2>
          {next ? (
            <button
              type="button"
              className="-mx-2 -my-1 flex w-[calc(100%+1rem)] items-baseline justify-between rounded-2xl px-2 py-1 text-left transition-colors hover:bg-paper-deep/60"
              onClick={() => navigate('/footprints')}
            >
              <span className="truncate">
                <span className="font-display text-base text-bark">{next.title}</span>
                <span className="ml-2 text-xs text-bark-soft">{kindLabel(next.kind)}</span>
              </span>
              <span className="shrink-0 text-sm font-medium text-bark">{countdownText(next)}</span>
            </button>
          ) : (
            <p className="leading-7 text-bark-soft">{t('forest.emptyAnniversary')}</p>
          )}
        </Card>
      </div>

      {/* 最近回忆 */}
      <div className="mt-4">
        <h2 className="mb-3 text-sm font-medium text-bark-soft">{t('forest.recentTitle')}</h2>
        {diariesQuery.isError ? (
          <ErrorState message={getErrorMessage(diariesQuery.error)} onRetry={() => void diariesQuery.refetch()} />
        ) : diariesQuery.isLoading ? (
          <LoadingState />
        ) : recent.length === 0 ? (
          <EmptyState
            icon={<LeafIcon className="h-6 w-6" />}
            title={t('forest.emptyRecent')}
            description={t('forest.emptyRecentDesc')}
            action={<Button onClick={() => navigate('/diary/new')}>{t('forest.goWrite')}</Button>}
          />
        ) : (
          <ul className="space-y-3">
            {recent.map((entry) => (
              <DiaryCard key={entry.id} entry={entry} authorName={authorName(entry.authorId)} />
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
