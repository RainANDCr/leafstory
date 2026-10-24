/** 专题阅读页：/story/book/:id —— 按装订顺序阅读，不可见条目显示占位 */
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LoadingState } from '@/components/feedback/LoadingState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { ChapterReader, type ReaderPage } from '@/features/story/ChapterReader'
import { useNavigate } from 'react-router-dom'
import { useCoupleSnapshot } from '@/features/couple/useCoupleSnapshot'
import { getStoryBook } from '@/services/storyService'
import { getErrorMessage } from '@/lib/errors'
import { zhCN } from '@/i18n'

export function StoryBookPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const coupleQuery = useCoupleSnapshot()

  const bookQuery = useQuery({
    queryKey: ['storyBook', id],
    queryFn: () => getStoryBook(id as string),
    enabled: Boolean(id),
    retry: false,
  })

  if (coupleQuery.isLoading || bookQuery.isLoading) return <LoadingState />
  if (bookQuery.isError || !bookQuery.data) {
    return (
      <ErrorState
        message={getErrorMessage(bookQuery.error)}
        onRetry={() => void qc.invalidateQueries({ queryKey: ['storyBook', id] })}
      />
    )
  }

  const { book, items, entries } = bookQuery.data
  const entryMap = new Map(entries.map((e) => [e.id, e]))
  const pages: ReaderPage[] = items.map((item) => {
    const entry = entryMap.get(item.entryId)
    return entry ? { key: item.entryId, entry } : { key: item.entryId, placeholder: true }
  })

  if (pages.length === 0) {
    return (
      <EmptyState
        title={book.title}
        description={zhCN.story.removedDesc}
        action={<Button onClick={() => navigate('/story')}>{zhCN.story.backToStory}</Button>}
      />
    )
  }

  const members = coupleQuery.data?.info?.members ?? []
  const authorName = (authorId: string) => members.find((m) => m.userId === authorId)?.nickname ?? '旅人'

  return (
    <ChapterReader
      key={book.id}
      title={book.title}
      subtitle={book.intro ?? undefined}
      pages={pages}
      authorName={authorName}
    />
  )
}
