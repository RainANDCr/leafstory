/**
 * 森林首页（阶段 2）：真实数据驱动的可交互回忆之树。
 * - 日记叶片点击弹出预览卡，再进全文；
 * - 相识/在一起/第一次约会纪念日以金色尖叶呈现（形状与颜色双重区分）；
 * - 写完共享日记回到这里时，新叶播放一次「长出一叶」动效（reduce-motion 降级）；
 * - 叶子数量只是记录的痕迹，不与感情评价挂钩。
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
import { countdownText, isGoldKind, kindLabel, nextAnniversary, withCountdown } from '@/features/anniversaries/ui'
import { useCoupleSnapshot } from '@/features/couple/useCoupleSnapshot'
import { listSharedDiariesForTree } from '@/services/diaryService'
import { listAnniversaries } from '@/services/anniversaryService'
import { listWishes } from '@/services/wishService'
import { getErrorMessage } from '@/lib/errors'
import { t, zhCN } from '@/i18n'

/** 编辑器写入的「刚长出的叶子」标记 */
const NEW_LEAF_KEY = 'leafstory:new-leaf'

export function ForestPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const coupleQuery = useCoupleSnapshot()
  const coupleId = coupleQuery.data?.info?.coupleId ?? null

  // 消费一次性的「新叶」标记（仅新写的共享日记会设置）
  const [highlightLeafId] = useState<string | null>(() => {
    try {
      const v = sessionStorage.getItem(NEW_LEAF_KEY)
      if (v) sessionStorage.removeItem(NEW_LEAF_KEY)
      return v
    } catch {
      return null
    }
  })
  const [grewNoticeVisible, setGrewNoticeVisible] = useState(Boolean(highlightLeafId))

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

  const wishesQuery = useQuery({
    queryKey: ['wishes', coupleId],
    queryFn: () => listWishes(coupleId!),
    enabled: Boolean(coupleId),
  })

  if (coupleQuery.isLoading) return <LoadingState />
  if (coupleQuery.isError) {
    return <ErrorState message={getErrorMessage(coupleQuery.error)} onRetry={() => void qc.invalidateQueries({ queryKey: ['couple'] })} />
  }

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
  const anniversaryGold = anniversaries
    .filter((a) => isGoldKind(a.kind))
    .slice(0, 3)
    .map((a) => ({ id: a.id, title: a.title, text: `${kindLabel(a.kind)} · ${countdownText(a)}` }))
  // 已完成的心愿也化为金叶（最多 2 片）；绑定了日记的直接跳过去
  const doneWishes = (wishesQuery.data ?? []).filter((w) => w.status === 'done').slice(0, 2)
  const wishGold = doneWishes.map((w) => ({
    id: w.id,
    title: w.title,
    text: w.completedAt ? `心愿达成 · ${new Date(w.completedAt).getMonth() + 1}月${new Date(w.completedAt).getDate()}日` : '心愿达成',
    linkTo: w.linkedDiaryId ? `/diary/${w.linkedDiaryId}` : '/interact',
  }))
  const goldLeaves = [...anniversaryGold, ...wishGold].slice(0, 5)

  return (
    <>
      <PageHeader title={t('forest.title')} description={t('forest.intro')} />

      {/* 新叶反馈：一次性轻提示（动效在叶片上） */}
      {grewNoticeVisible ? (
        <p role="status" className="mb-2 rounded-2xl border border-leaf-gold/40 bg-leaf-gold/10 px-4 py-2 text-center text-sm text-bark">
          🍃 {t('forest.newLeafGrew')}
          <button type="button" aria-label={t('common.cancel')} className="ml-2 text-xs text-bark-soft" onClick={() => setGrewNoticeVisible(false)}>
            ✕
          </button>
        </p>
      ) : null}

      {/* 回忆之树 */}
      <div className="relative mb-2">
        <MemoryTree
          className="mx-auto w-full max-w-sm"
          leaves={leaves.map((e) => ({
            id: e.id,
            mood: e.mood,
            title: e.title,
            happenedOn: e.happenedOn,
            snippet: e.content.length > 80 ? `${e.content.slice(0, 80)}…` : e.content,
          }))}
          goldLeaves={goldLeaves}
          highlightLeafId={highlightLeafId}
        />
        <MonkeyMascot className="absolute bottom-2 left-1 w-20 sm:w-24" />
      </div>
      <p className="mb-1 text-center font-display text-lg text-bark">{t('app.tagline')}</p>
      {entries.length > 0 ? (
        <p className="mb-6 text-center text-xs text-bark-soft">
          {zhCN.forest.leafCount(entries.length)} · {t('forest.leafCountHint')}
          <Link to="/diary" className="ml-2 underline underline-offset-2">
            {t('forest.viewAllLeaves')} →
          </Link>
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
