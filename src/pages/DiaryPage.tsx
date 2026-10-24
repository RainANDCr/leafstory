/**
 * 日记列表：搜索、心情/作者筛选、按月分组的时间轴、分页加载。
 * 隐私由 RLS 保证：这里看到的永远是「我有权看的」日记。
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { LoadingState } from '@/components/feedback/LoadingState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { DiaryIcon, LeafIcon } from '@/components/layout/icons'
import { DiaryCard } from '@/features/diary/components/DiaryCard'
import { MOODS, type Mood } from '@/features/diary/types'
import { useCoupleSnapshot, partnerOf } from '@/features/couple/useCoupleSnapshot'
import { useAuth } from '@/features/auth/AuthContext'
import { listDiaries } from '@/services/diaryService'
import { formatMonthLabel } from '@/lib/dates'
import { getErrorMessage } from '@/lib/errors'
import { t } from '@/i18n'

type AuthorFilter = 'all' | 'me' | 'partner'

export function DiaryPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { userId } = useAuth()
  const coupleQuery = useCoupleSnapshot()

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [mood, setMood] = useState<Mood | ''>('')
  const [author, setAuthor] = useState<AuthorFilter>('all')

  const couple = coupleQuery.data
  const partner = partnerOf(couple?.info ?? null, userId)
  const unpaired = coupleQuery.isSuccess && (!couple || couple.state === 'unpaired')

  const filter = useMemo(
    () => ({
      search,
      mood: mood || undefined,
      authorId: author === 'me' ? (userId ?? undefined) : author === 'partner' ? (partner?.userId ?? undefined) : undefined,
    }),
    [search, mood, author, userId, partner?.userId],
  )

  const diariesQuery = useInfiniteQuery({
    queryKey: ['diaries', JSON.stringify(filter)],
    queryFn: ({ pageParam }) => listDiaries(pageParam as number, filter),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.hasMore ? all.length : undefined),
    enabled: coupleQuery.isSuccess && Boolean(!unpaired),
  })

  function onSubmitSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearch(searchInput.trim())
  }

  if (coupleQuery.isLoading) return <LoadingState />
  if (coupleQuery.isError) return <ErrorState message={getErrorMessage(coupleQuery.error)} onRetry={() => void qc.invalidateQueries({ queryKey: ['couple'] })} />

  if (unpaired) {
    return (
      <>
        <PageHeader title={t('diary.title')} description={t('diary.intro')} />
        <EmptyState
          icon={<LeafIcon className="h-6 w-6" />}
          title={t('forest.needPairing')}
          description={t('forest.needPairingDesc')}
          action={<Button onClick={() => navigate('/pairing')}>{t('forest.goPairing')}</Button>}
        />
      </>
    )
  }

  const entries = diariesQuery.data?.pages.flatMap((p) => p.items) ?? []
  const authorName = (authorId: string) =>
    couple?.info?.members.find((m) => m.userId === authorId)?.nickname ?? '旅人'

  // 按月分组（保持原排序）
  const groups: Array<{ month: string; items: typeof entries }> = []
  for (const entry of entries) {
    const month = formatMonthLabel(entry.happenedOn)
    const last = groups[groups.length - 1]
    if (last && last.month === month) last.items.push(entry)
    else groups.push({ month, items: [entry] })
  }

  const noResultButHasData = diariesQuery.isSuccess && entries.length === 0

  return (
    <>
      <PageHeader
        title={t('diary.title')}
        description={t('diary.intro')}
        actions={
          <Link
            to="/diary/new"
            className="inline-flex min-h-11 items-center rounded-2xl bg-bark px-4 text-sm font-medium text-paper transition-colors hover:bg-bark-deep"
          >
            {t('diary.writeAction')}
          </Link>
        }
      />

      {/* 搜索与筛选 */}
      <div className="mb-4 space-y-3">
        <form onSubmit={onSubmitSearch} role="search">
          <input
            type="search"
            className="w-full min-h-11 rounded-2xl border border-paper-edge bg-card px-4 text-sm text-bark shadow-soft placeholder:text-bark-soft/60"
            placeholder={t('diary.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label={t('diary.searchPlaceholder')}
          />
        </form>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={mood === ''}
            onClick={() => setMood('')}
            className={`min-h-9 rounded-full border px-3 text-xs transition-colors ${
              mood === '' ? 'border-bark bg-bark text-paper' : 'border-paper-edge bg-card text-bark-soft hover:text-bark'
            }`}
          >
            {t('diary.filterAll')}
          </button>
          {MOODS.map((m) => (
            <button
              key={m.key}
              type="button"
              aria-pressed={mood === m.key}
              onClick={() => setMood(mood === m.key ? '' : m.key)}
              className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors ${
                mood === m.key ? 'border-bark bg-bark text-paper' : 'border-paper-edge bg-card text-bark-soft hover:text-bark'
              }`}
            >
              <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {(
            [
              ['all', t('diary.filterAuthorAll')],
              ['me', t('diary.filterAuthorMe')],
              ['partner', t('diary.filterAuthorPartner')],
            ] as ReadonlyArray<readonly [AuthorFilter, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={author === key}
              disabled={key === 'partner' && !partner}
              onClick={() => setAuthor(key)}
              className={`min-h-9 rounded-full border px-3 text-xs transition-colors disabled:opacity-40 ${
                author === key ? 'border-bark bg-bark text-paper' : 'border-paper-edge bg-card text-bark-soft hover:text-bark'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 时间轴 */}
      {diariesQuery.isError ? (
        <ErrorState message={getErrorMessage(diariesQuery.error)} onRetry={() => void diariesQuery.refetch()} />
      ) : diariesQuery.isLoading ? (
        <LoadingState />
      ) : noResultButHasData ? (
        <EmptyState
          icon={<DiaryIcon className="h-6 w-6" />}
          title={search || mood || author !== 'all' ? t('diary.emptySearchTitle') : t('diary.emptyTitle')}
          description={search || mood || author !== 'all' ? t('diary.emptySearchDesc') : t('diary.emptyDesc')}
          action={
            search || mood || author !== 'all' ? undefined : (
              <Link
                to="/diary/new"
                className="inline-flex min-h-11 items-center rounded-2xl bg-bark px-4 text-sm font-medium text-paper transition-colors hover:bg-bark-deep"
              >
                {t('diary.writeAction')}
              </Link>
            )
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.month} aria-label={group.month}>
              <h2 className="mb-3 font-display text-sm tracking-widest text-bark-soft">{group.month}</h2>
              <ul className="space-y-3">
                {group.items.map((entry) => (
                  <DiaryCard key={entry.id} entry={entry} authorName={authorName(entry.authorId)} />
                ))}
              </ul>
            </section>
          ))}

          {diariesQuery.hasNextPage ? (
            <div className="flex justify-center">
              <Button variant="secondary" onClick={() => void diariesQuery.fetchNextPage()} disabled={diariesQuery.isFetchingNextPage}>
                {diariesQuery.isFetchingNextPage ? t('common.loading') : t('common.more')}
              </Button>
            </div>
          ) : (
            entries.length > 0 && <p className="text-center text-xs text-bark-soft">{t('common.noMore')}</p>
          )}
        </div>
      )}
    </>
  )
}
