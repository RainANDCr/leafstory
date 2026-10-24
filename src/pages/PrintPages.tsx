/** 打印路由页面：单篇日记 / 月度章节 / 专题 / 年度金叶（浏览器打印即 PDF） */
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PrintShell } from '@/components/print/PrintShell'
import { LoadingState } from '@/components/feedback/LoadingState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { getMood } from '@/features/diary/types'
import { getDiaryDetail, listVisibleDiariesForStory } from '@/services/diaryService'
import { getStoryBook } from '@/services/storyService'
import { chapterOf } from '@/features/story/logic'
import { useCoupleSnapshot } from '@/features/couple/useCoupleSnapshot'
import { formatDateHuman } from '@/lib/dates'
import { zhCN } from '@/i18n'

function DiaryBlock({ entryId }: { entryId: string }) {
  const detail = useQuery({ queryKey: ['diary', entryId], queryFn: () => getDiaryDetail(entryId) })
  if (detail.isLoading) return <LoadingState />
  if (detail.isError || !detail.data) return <ErrorState message={zhCN.story.removedTitle} />

  const { entry, mediaUrls } = detail.data
  return (
    <article className="print-card mb-8 rounded-card border border-paper-edge bg-card p-5 shadow-soft">
      <p className="text-xs text-bark-soft">
        {formatDateHuman(entry.happenedOn)} · {getMood(entry.mood).label}
        {entry.category ? ` · ${entry.category}` : ''}
      </p>
      <h2 className="mt-1 font-display text-xl text-bark">{entry.title || '无题'}</h2>
      <div className="mt-3 whitespace-pre-wrap text-[15px] leading-8 text-bark">{entry.content}</div>
      {mediaUrls.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {mediaUrls.map((url) => (
            <img key={url} src={url} alt="" className="h-24 w-24 rounded-lg border border-paper-edge object-cover" />
          ))}
        </div>
      ) : null}
    </article>
  )
}

export function PrintDiaryPage() {
  const { id } = useParams()
  return (
    <PrintShell title={zhCN.app.name}>
      <DiaryBlock entryId={id ?? ''} />
    </PrintShell>
  )
}

export function PrintMonthPage() {
  const { yearMonth } = useParams()
  const coupleQuery = useCoupleSnapshot()
  const coupleId = coupleQuery.data?.info?.coupleId ?? null
  const diaries = useQuery({
    queryKey: ['storyDiaries', coupleId],
    queryFn: () => listVisibleDiariesForStory(),
    enabled: Boolean(coupleId),
  })
  if (diaries.isLoading || coupleQuery.isLoading) return <LoadingState />
  const chapter = yearMonth ? chapterOf(diaries.data ?? [], yearMonth) : null
  if (!chapter) return <ErrorState message={zhCN.story.removedTitle} />
  return (
    <PrintShell title={`${chapter.year} 年 ${chapter.month} 月`}>
      {chapter.entries.map((e) => (
        <DiaryBlock key={e.id} entryId={e.id} />
      ))}
    </PrintShell>
  )
}

export function PrintBookPage() {
  const { id } = useParams()
  const book = useQuery({ queryKey: ['storyBook', id], queryFn: () => getStoryBook(id ?? ''), enabled: Boolean(id) })
  if (book.isLoading) return <LoadingState />
  if (book.isError || !book.data) return <ErrorState message={zhCN.story.removedTitle} />
  return (
    <PrintShell title={book.data.book.title}>
      {book.data.book.intro ? <p className="mb-6 text-sm leading-7 text-bark-soft">{book.data.book.intro}</p> : null}
      {book.data.entries.map((e) => (
        <DiaryBlock key={e.id} entryId={e.id} />
      ))}
    </PrintShell>
  )
}
