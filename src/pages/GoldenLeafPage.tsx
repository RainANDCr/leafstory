/**
 * 年度金叶页：/story/golden/:year
 * - 统计全部确定性生成（无 AI）：日记/照片/城市/心愿成真/每月分布；
 * - 「年度一句话」与「最珍贵的一天」只由用户自己选择与保存；
 * - 金叶时刻（该年的纪念日 + 实现的心愿）可跳回原始日记；
 * - 可打印（打印路由复用同一视图）；AI 整理为可选入口（默认不选素材）。
 */
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LeafIcon } from '@/components/layout/icons'
import { AiPolishDialog } from '@/features/ai/AiPolishDialog'
import { buildYearStats, availableYears } from '@/features/yearly/logic'
import { groupByMonth } from '@/features/story/logic'
import { kindLabel } from '@/features/anniversaries/ui'
import { useAuth } from '@/features/auth/AuthContext'
import { useCoupleSnapshot } from '@/features/couple/useCoupleSnapshot'
import { listVisibleDiariesForStory } from '@/services/diaryService'
import { listWishes } from '@/services/wishService'
import { listAnniversaries } from '@/services/anniversaryService'
import { listPlaces } from '@/services/placeService'
import { getGoldenLeaf, saveGoldenLeaf } from '@/services/goldenLeafService'
import { formatDateHuman } from '@/lib/dates'
import { getErrorMessage } from '@/lib/errors'
import { t, zhCN } from '@/i18n'

export function GoldenLeafPage() {
  const { year: yearParam } = useParams()
  const year = Number(yearParam) || new Date().getFullYear()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { userId } = useAuth()
  const coupleQuery = useCoupleSnapshot()
  const couple = coupleQuery.data?.info ?? null
  const coupleId = couple?.coupleId ?? null

  const diariesQuery = useQuery({
    queryKey: ['storyDiaries', coupleId],
    queryFn: () => listVisibleDiariesForStory(),
    enabled: Boolean(coupleId),
    staleTime: 60_000,
  })
  const wishesQuery = useQuery({ queryKey: ['wishes', coupleId], queryFn: () => listWishes(coupleId!), enabled: Boolean(coupleId) })
  const annQuery = useQuery({ queryKey: ['anniversaries', coupleId], queryFn: () => listAnniversaries(coupleId!), enabled: Boolean(coupleId) })
  const placesQuery = useQuery({ queryKey: ['places', coupleId], queryFn: () => listPlaces(coupleId!), enabled: Boolean(coupleId) })
  const leafQuery = useQuery({
    queryKey: ['goldenLeaf', coupleId, year],
    queryFn: () => getGoldenLeaf(coupleId!, year),
    enabled: Boolean(coupleId),
  })

  const [aiOpen, setAiOpen] = useState(false)
  const [titleDraft, setTitleDraft] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  const saveMutation = useMutation({
    mutationFn: (patch: { title: string | null; preciousDay: string | null }) =>
      saveGoldenLeaf(coupleId!, year, userId ?? '', patch),
    onSuccess: () => {
      setTitleDraft(null)
      void qc.invalidateQueries({ queryKey: ['goldenLeaf'] })
    },
    onError: (err) => setActionError(getErrorMessage(err)),
  })

  if (coupleQuery.isLoading) return <LoadingState />
  if (coupleQuery.isError) {
    return <ErrorState message={getErrorMessage(coupleQuery.error)} onRetry={() => void qc.invalidateQueries({ queryKey: ['couple'] })} />
  }
  if (!coupleId) {
    return (
      <>
        <PageHeader title={t('yearly.title')} />
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
  const wishes = wishesQuery.data ?? []
  const places = placesQuery.data ?? []
  const anniversaries = annQuery.data ?? []

  const stats = buildYearStats(year, entries, wishes, places)
  const yearEntries = entries.filter((e) => e.happenedOn.startsWith(String(year)))
  const yearGroups = groupByMonth(yearEntries)
  const goldMoments = [
    ...anniversaries
      .filter((a) => a.anniversaryDate.startsWith(String(year)))
      .map((a) => ({ key: `ann-${a.id}`, label: a.title, sub: kindLabel(a.kind), link: null as string | null })),
    ...wishes
      .filter((w) => w.status === 'done' && (w.completedAt ?? '').startsWith(String(year)))
      .map((w) => ({ key: `wish-${w.id}`, label: w.title, sub: t('wishes.statusDone'), link: w.linkedDiaryId ? `/diary/${w.linkedDiaryId}` : null })),
  ]
  const years = availableYears(entries)
  const leaf = leafQuery.data
  const isEmpty = stats.diaryCount === 0 && goldMoments.length === 0

  return (
    <>
      <PageHeader
        title={`${t('yearly.title')} · ${year}`}
        actions={
          <>
            <select
              aria-label={t('yearly.pickYear')}
              className="min-h-11 rounded-2xl border border-paper-edge bg-card px-3 text-sm text-bark"
              value={year}
              onChange={(e) => navigate(`/story/golden/${e.target.value}`)}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <Button variant="secondary" onClick={() => navigate(`/print/golden/${year}`)}>
              🖨 {t('yearly.printAction')}
            </Button>
            <Button variant="secondary" onClick={() => setAiOpen(true)}>
              {t('yearly.aiAction')}
            </Button>
          </>
        }
      />

      {actionError ? (
        <p role="alert" className="mb-4 rounded-2xl border border-maple/40 bg-maple/5 p-3 text-sm text-maple">
          {actionError}
        </p>
      ) : null}
      <p className="mb-5 text-xs leading-5 text-bark-soft">{t('yearly.exportNote')}</p>

      {isEmpty ? (
        <EmptyState icon={<LeafIcon className="h-6 w-6" />} title={zhCN.yearly.emptyTitle(year)} description={t('yearly.emptyDesc')} />
      ) : (
        <div className="space-y-5">
          {/* 年度一句话 */}
          <Card>
            <p className="text-xs font-medium text-bark-soft">{t('yearly.titleLabel')}</p>
            {titleDraft === null ? (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <p className="font-display text-xl text-bark">{leaf?.title || '—'}</p>
                <Button variant="ghost" onClick={() => setTitleDraft(leaf?.title ?? '')}>
                  {t('common.edit')}
                </Button>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  className="min-h-11 flex-1 rounded-2xl border border-paper-edge bg-paper px-3.5 text-sm text-bark"
                  maxLength={60}
                  placeholder={t('yearly.titlePlaceholder')}
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                />
                <Button onClick={() => saveMutation.mutate({ title: titleDraft.trim() || null, preciousDay: leaf?.preciousDay ?? null })}>
                  {t('yearly.saveTitle')}
                </Button>
                <Button variant="ghost" onClick={() => setTitleDraft(null)}>
                  {t('common.cancel')}
                </Button>
              </div>
            )}
          </Card>

          {/* 统计 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              zhCN.yearly.statDiaries(stats.diaryCount),
              zhCN.yearly.statPhotos(stats.photoCount),
              zhCN.yearly.statCities(stats.cityCount),
              zhCN.yearly.statWishes(stats.wishDoneCount),
            ].map((label) => (
              <Card key={label} className="!p-4 text-center">
                <p className="font-display text-base text-bark">{label}</p>
              </Card>
            ))}
          </div>

          {/* 每月分布 */}
          <Card>
            <h2 className="mb-3 text-sm font-medium text-bark-soft">{t('yearly.monthlyTitle')}</h2>
            <div className="flex h-28 items-end gap-1.5">
              {stats.monthly.map((count, i) => {
                const max = Math.max(...stats.monthly, 1)
                return (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t-lg bg-leaf-gold/70"
                      style={{ height: `${Math.max((count / max) * 100, count > 0 ? 8 : 2)}%` }}
                      title={`${zhCN.yearly.monthNames[i]}：${count}`}
                    />
                    <span className="text-[10px] text-bark-soft">{i + 1}</span>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* 最珍贵的一天 */}
          <Card>
            <h2 className="text-sm font-medium text-bark-soft">{t('yearly.preciousTitle')}</h2>
            <p className="mt-0.5 text-xs text-bark-soft">{t('yearly.preciousHint')}</p>
            {stats.diaryDays.length === 0 ? (
              <p className="mt-2 text-sm text-bark-soft">{t('yearly.preciousEmpty')}</p>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  aria-label={t('yearly.preciousTitle')}
                  className="min-h-11 rounded-2xl border border-paper-edge bg-paper px-3 text-sm text-bark"
                  value={leaf?.preciousDay ?? ''}
                  onChange={(e) =>
                    saveMutation.mutate({ title: leaf?.title ?? null, preciousDay: e.target.value || null })
                  }
                >
                  <option value="">（未选择）</option>
                  {stats.diaryDays.map((d) => (
                    <option key={d} value={d}>
                      {formatDateHuman(d)}
                    </option>
                  ))}
                </select>
                {leaf?.preciousDay ? (
                  <Link to={`/diary/${yearEntries.find((e) => e.happenedOn === leaf.preciousDay)?.id ?? ''}`} className="text-xs text-leaf-gold underline underline-offset-2">
                    {t('forest.treePopoverView')} →
                  </Link>
                ) : null}
              </div>
            )}
          </Card>

          {/* 金叶时刻 */}
          <Card>
            <h2 className="mb-3 text-sm font-medium text-bark-soft">{t('yearly.goldMomentsTitle')}</h2>
            {goldMoments.length === 0 ? (
              <p className="text-sm text-bark-soft">{t('yearly.goldMomentsEmpty')}</p>
            ) : (
              <ul className="space-y-2">
                {goldMoments.map((m) => (
                  <li key={m.key} className="flex items-center justify-between rounded-2xl bg-paper-deep px-4 py-2.5">
                    <span className="flex items-center gap-2 text-sm text-bark">
                      <LeafIcon className="h-4 w-4 text-leaf-gold" />
                      {m.label}
                    </span>
                    <span className="flex items-center gap-3 text-xs text-bark-soft">
                      {m.sub}
                      {m.link ? (
                        <Link to={m.link} className="text-leaf-gold underline underline-offset-2">
                          {t('forest.treePopoverView')}
                        </Link>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* 月度章节 */}
          {yearGroups.length > 0 ? (
            <Card>
              <h2 className="mb-3 text-sm font-medium text-bark-soft">{t('yearly.chaptersTitle')}</h2>
              <ul className="flex flex-wrap gap-2">
                {yearGroups[0]!.chapters.map((ch) => (
                  <li key={ch.key}>
                    <Link
                      to={`/story/month/${ch.key}`}
                      className="inline-flex min-h-10 items-center rounded-full border border-paper-edge bg-card px-3.5 text-xs text-bark hover:bg-paper-deep"
                    >
                      {ch.month} 月 · {zhCN.story.monthEntries(ch.entries.length)}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <p className="text-xs text-bark-soft">{t('yearly.aiNote')}</p>
        </div>
      )}

      <AiPolishDialog open={aiOpen} candidates={yearEntries} contextTitle={`${year} 年度金叶`} onClose={() => setAiOpen(false)} />
    </>
  )
}
