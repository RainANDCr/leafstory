/** 月度章节页：/story/month/:yearMonth —— 可见日记的虚拟聚合章节 */
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LoadingState } from '@/components/feedback/LoadingState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { ChapterReader } from '@/features/story/ChapterReader'
import { chapterOf } from '@/features/story/logic'
import { useNavigate } from 'react-router-dom'
import { useCoupleSnapshot } from '@/features/couple/useCoupleSnapshot'
import { listVisibleDiariesForStory } from '@/services/diaryService'
import { formatDateHuman } from '@/lib/dates'
import { getErrorMessage } from '@/lib/errors'
import { zhCN } from '@/i18n'

export function StoryMonthPage() {
  const { yearMonth } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const coupleQuery = useCoupleSnapshot()
  const coupleId = coupleQuery.data?.info?.coupleId ?? null

  const diariesQuery = useQuery({
    queryKey: ['storyDiaries', coupleId],
    queryFn: () => listVisibleDiariesForStory(),
    enabled: Boolean(coupleId),
    staleTime: 60_000,
  })

  if (coupleQuery.isLoading || diariesQuery.isLoading) return <LoadingState />
  if (coupleQuery.isError || diariesQuery.isError) {
    return <ErrorState message={getErrorMessage(coupleQuery.error ?? diariesQuery.error)} onRetry={() => void qc.invalidateQueries()} />
  }

  const chapter = yearMonth ? chapterOf(diariesQuery.data ?? [], yearMonth) : null
  if (!chapter) {
    return (
      <EmptyState
        title={zhCN.story.removedTitle}
        description={zhCN.story.removedDesc}
        action={<Button onClick={() => navigate('/story')}>{zhCN.story.backToStory}</Button>}
      />
    )
  }

  const members = coupleQuery.data?.info?.members ?? []
  const authorName = (authorId: string) => members.find((m) => m.userId === authorId)?.nickname ?? '旅人'

  return (
    <ChapterReader
      key={`${chapter.year}-${chapter.month}`}
      title={`${chapter.year} 年 ${chapter.month} 月`}
      subtitle={`${formatDateHuman(chapter.firstDate)} ${zhCN.story.rangeSep} ${formatDateHuman(chapter.lastDate)} · ${zhCN.story.monthEntries(chapter.entries.length)}`}
      pages={chapter.entries.map((entry) => ({ key: entry.id, entry }))}
      authorName={authorName}
    />
  )
}
