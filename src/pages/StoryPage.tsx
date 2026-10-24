/**
 * 故事页（阶段 2 完整版）：
 * - 「月与年」：可见日记自动聚合的虚拟章节（封面心情色 + 日期范围 + 篇数）；
 * - 「自定义专题」：story_books 列表，可新建/编辑/删除/排序，不删原始日记。
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { StoryIcon } from '@/components/layout/icons'
import { TopicFormDialog } from '@/features/story/TopicFormDialog'
import { groupByMonth } from '@/features/story/logic'
import { getMood } from '@/features/diary/types'
import { useAuth } from '@/features/auth/AuthContext'
import { useCoupleSnapshot } from '@/features/couple/useCoupleSnapshot'
import { listVisibleDiariesForStory } from '@/services/diaryService'
import { createStoryBook, deleteStoryBook, getStoryBook, listStoryBooks, reorderStoryBooks, updateStoryBook, type StoryBook } from '@/services/storyService'
import { formatDateShort } from '@/lib/dates'
import { getErrorMessage } from '@/lib/errors'
import { t, zhCN } from '@/i18n'

type Tab = 'timeline' | 'topics'

export function StoryPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { userId } = useAuth()
  const coupleQuery = useCoupleSnapshot()
  const coupleId = coupleQuery.data?.info?.coupleId ?? null

  const [tab, setTab] = useState<Tab>('timeline')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<{ book: StoryBook; entryIds: string[] } | null>(null)
  const [deleting, setDeleting] = useState<{ id: string; title: string } | null>(null)
  const [actionError, setActionError] = useState('')

  const diariesQuery = useQuery({
    queryKey: ['storyDiaries', coupleId],
    queryFn: () => listVisibleDiariesForStory(),
    enabled: Boolean(coupleId),
    staleTime: 60_000,
  })

  const booksQuery = useQuery({
    queryKey: ['storyBooks', coupleId],
    queryFn: () => listStoryBooks(coupleId!),
    enabled: Boolean(coupleId),
  })

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['storyBooks'] })
    void qc.invalidateQueries({ queryKey: ['storyBook'] })
  }

  const saveMutation = useMutation({
    mutationFn: async (input: { title: string; intro: string | null; coverMood: string | null; entryIds: string[] }) => {
      if (!coupleId || !userId) throw new Error('未配对')
      if (editing) await updateStoryBook(editing.book.id, input)
      else await createStoryBook(coupleId, userId, input)
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
    mutationFn: (id: string) => deleteStoryBook(id),
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

  const moveMutation = useMutation({
    mutationFn: (ids: string[]) => reorderStoryBooks(ids),
    onSuccess: invalidate,
    onError: (err) => setActionError(getErrorMessage(err)),
  })

  if (coupleQuery.isLoading) return <LoadingState />
  if (coupleQuery.isError) {
    return <ErrorState message={getErrorMessage(coupleQuery.error)} onRetry={() => void qc.invalidateQueries({ queryKey: ['couple'] })} />
  }

  if (!coupleId) {
    return (
      <>
        <PageHeader title={t('story.title')} description={t('story.intro')} />
        <EmptyState
          icon={<StoryIcon className="h-6 w-6" />}
          title={t('forest.needPairing')}
          description={t('forest.needPairingDesc')}
          action={<Button onClick={() => navigate('/pairing')}>{t('forest.goPairing')}</Button>}
        />
      </>
    )
  }

  const entries = diariesQuery.data ?? []
  const years = groupByMonth(entries)
  const books = booksQuery.data ?? []

  /** 编辑前载入既有的条目顺序（含不可见条目，保存时原样保留） */
  async function openEdit(book: StoryBook) {
    try {
      const detail = await getStoryBook(book.id)
      setEditing({ book, entryIds: detail.items.map((i) => i.entryId) })
      setFormOpen(true)
    } catch {
      setActionError(getErrorMessage(null))
    }
  }

  function moveBook(index: number, delta: -1 | 1) {
    const ids = books.map((b) => b.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]
    moveMutation.mutate(ids)
  }

  return (
    <>
      <PageHeader
        title={t('story.title')}
        description={t('story.intro')}
        actions={
          tab === 'topics' ? (
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              {t('story.newTopic')}
            </Button>
          ) : undefined
        }
      />

      {/* 模式切换 */}
      <div className="mb-4 flex w-fit rounded-2xl bg-paper-deep p-1 text-sm" role="tablist">
        {(
          [
            ['timeline', t('story.tabTimeline')],
            ['topics', t('story.tabTopics')],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={`min-h-10 rounded-xl px-4 transition-colors ${tab === value ? 'bg-card text-bark shadow-soft' : 'text-bark-soft'}`}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {actionError ? (
        <p role="alert" className="mb-4 rounded-2xl border border-maple/40 bg-maple/5 p-3 text-sm text-maple">
          {actionError}
        </p>
      ) : null}

      {tab === 'timeline' ? (
        diariesQuery.isLoading ? (
          <LoadingState />
        ) : diariesQuery.isError ? (
          <ErrorState message={getErrorMessage(diariesQuery.error)} onRetry={() => void diariesQuery.refetch()} />
        ) : years.length === 0 ? (
          <EmptyState icon={<StoryIcon className="h-6 w-6" />} title={t('story.emptyTitle')} description={t('story.emptyDesc')} />
        ) : (
          <div className="space-y-8">
            {years.map((year) => (
              <section key={year.year} aria-label={`${year.year}`}>
                <div className="mb-3 flex items-baseline gap-2">
                  <h2 className="font-display text-xl text-bark">{year.year} 年</h2>
                  <span className="text-xs text-bark-soft">{zhCN.story.monthEntries(year.total)}</span>
                </div>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {year.chapters.map((ch) => {
                    const colors = Array.from(new Set(ch.entries.map((e) => getMood(e.mood).color))).slice(0, 3)
                    return (
                      <li key={ch.key}>
                        <Link
                          to={`/story/month/${ch.key}`}
                          className="block rounded-card border border-paper-edge bg-card p-4 shadow-soft transition-colors hover:bg-paper-deep/60"
                        >
                          <div className="flex items-center gap-2">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-paper-deep font-display text-lg text-bark">
                              {ch.month}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="font-display text-base text-bark">
                                {ch.year} 年 {ch.month} 月
                              </p>
                              <p className="text-xs text-bark-soft">
                                {formatDateShort(ch.firstDate)}
                                {zhCN.story.rangeSep}
                                {formatDateShort(ch.lastDate)} · {zhCN.story.monthEntries(ch.entries.length)}
                              </p>
                            </div>
                          </div>
                          {/* 封面：本章心情色条 */}
                          <div className="mt-3 flex gap-1.5" aria-hidden="true">
                            {colors.map((c) => (
                              <span key={c} className="h-2 flex-1 rounded-full" style={{ backgroundColor: c }} />
                            ))}
                            {colors.length === 0 ? <span className="h-2 flex-1 rounded-full bg-paper-edge" /> : null}
                          </div>
                          <p className="mt-2 text-xs text-bark-soft">{t('story.openChapter')} →</p>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )
      ) : (
        <>
          {booksQuery.isLoading ? (
            <LoadingState />
          ) : booksQuery.isError ? (
            <ErrorState message={getErrorMessage(booksQuery.error)} onRetry={() => void booksQuery.refetch()} />
          ) : books.length === 0 ? (
            <EmptyState
              icon={<StoryIcon className="h-6 w-6" />}
              title={t('story.topicsEmptyTitle')}
              description={t('story.topicsEmptyDesc')}
              action={<Button onClick={() => setFormOpen(true)}>{t('story.newTopic')}</Button>}
            />
          ) : (
            <ul className="space-y-3">
              {books.map((book, index) => (
                <li key={book.id}>
                  <Card className="flex items-center justify-between gap-4 !p-4">
                    <Link to={`/story/book/${book.id}`} className="flex min-w-0 flex-1 items-center gap-3.5">
                      <span
                        aria-hidden="true"
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                        style={{ backgroundColor: `${getMood(book.coverMood ?? 'joy').color}33` }}
                      >
                        <StoryIcon className="h-6 w-6" style={{ color: getMood(book.coverMood ?? 'joy').color }} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-display text-base text-bark">{book.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-bark-soft">{book.intro || t('story.openChapter')} →</span>
                      </span>
                    </Link>
                    <div className="flex shrink-0 flex-col gap-1 text-xs">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          aria-label={t('story.moveUp')}
                          className="h-8 w-8 rounded-lg border border-paper-edge bg-card"
                          disabled={index === 0 || moveMutation.isPending}
                          onClick={() => moveBook(index, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label={t('story.moveDown')}
                          className="h-8 w-8 rounded-lg border border-paper-edge bg-card"
                          disabled={index === books.length - 1 || moveMutation.isPending}
                          onClick={() => moveBook(index, 1)}
                        >
                          ↓
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-bark-soft underline underline-offset-2 hover:text-bark"
                          onClick={() => void openEdit(book)}
                        >
                          {t('common.edit')}
                        </button>
                        <button type="button" className="text-maple underline underline-offset-2" onClick={() => setDeleting({ id: book.id, title: book.title })}>
                          {t('common.delete')}
                        </button>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <TopicFormDialog
        open={formOpen}
        initial={editing ? { book: editing.book, entryIds: editing.entryIds } : null}
        entries={entries}
        busy={saveMutation.isPending}
        onSubmit={(input) => saveMutation.mutate(input)}
        onCancel={() => {
          setFormOpen(false)
          setEditing(null)
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={t('story.deleteBookTitle')}
        description={`「${deleting?.title ?? ''}」${t('story.deleteBookDesc')}`}
        confirmLabel={t('common.delete')}
        danger
        busy={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}
