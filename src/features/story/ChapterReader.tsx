/**
 * 章节阅读器：月度章节与自定义专题共用。
 * - 「翻页阅读」：移动端优先的单页模式，轻纸页滑动动效（reduce-motion 降级），
 *   支持键盘 ←/→ 翻页；
 * - 「列表模式」：普通列表查看，动效不影响可用性；
 * - 已移除/不可见的条目显示占位卡，不抛错、不泄露内容。
 */
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { DiaryCard } from '@/features/diary/components/DiaryCard'
import { getMood, type DiaryEntry } from '@/features/diary/types'
import { getDiaryDetail } from '@/services/diaryService'
import { formatDateHuman } from '@/lib/dates'
import { zhCN } from '@/i18n'

export interface ReaderPage {
  /** 有日记内容的页 */
  entry?: DiaryEntry
  /** 占位页（原记录已移除或不可见） */
  placeholder?: boolean
  key: string
}

interface ChapterReaderProps {
  title: string
  subtitle?: string
  /** 阅读顺序的页（含占位） */
  pages: readonly ReaderPage[]
  /** 列表模式下显示的作者名 */
  authorName: (authorId: string) => string
  /** 打印路由（如 /print/month/2026-10） */
  printPath?: string
}

export function ChapterReader({ title, subtitle, pages, authorName, printPath }: ChapterReaderProps) {
  const [mode, setMode] = useState<'reader' | 'list'>('reader')
  const [index, setIndex] = useState(0)
  const total = pages.length
  const current = pages[Math.min(index, Math.max(total - 1, 0))]

  // 键盘翻页
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(total - 1, i + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [total])

  // 当前页的照片（复用日记详情缓存，懒加载不全量拉取）
  const detailQuery = useQuery({
    queryKey: ['diary', current?.entry?.id],
    queryFn: () => getDiaryDetail(current!.entry!.id),
    enabled: mode === 'reader' && Boolean(current?.entry),
  })

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl tracking-wide text-bark">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-bark-soft">{subtitle}</p> : null}
        </div>
        <div className="flex gap-2">
          {printPath ? (
            <Link
              to={printPath}
              className="inline-flex min-h-11 items-center rounded-2xl border border-paper-edge bg-card px-4 text-sm text-bark transition-colors hover:bg-paper-deep"
            >
              🖨 {zhCN.print.action}
            </Link>
          ) : null}
          <div className="flex rounded-2xl bg-paper-deep p-1 text-xs" role="tablist" aria-label={zhCN.story.title}>
          {(
            [
              ['reader', zhCN.story.readerMode],
              ['list', zhCN.story.listMode],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              className={`min-h-9 rounded-xl px-3 transition-colors ${
                mode === value ? 'bg-card text-bark shadow-soft' : 'text-bark-soft'
              }`}
              onClick={() => setMode(value)}
            >
              {label}
            </button>
          ))}
          </div>
        </div>
      </div>

      {mode === 'list' ? (
        <ul className="space-y-3">
          {pages.map((page) =>
            page.entry ? (
              <DiaryCard key={page.key} entry={page.entry} authorName={authorName(page.entry.authorId)} />
            ) : (
              <li key={page.key} className="rounded-card border border-dashed border-paper-edge bg-paper/70 p-4 text-center">
                <p className="text-sm text-bark-soft">{zhCN.story.removedTitle}</p>
                <p className="mt-1 text-xs text-bark-soft/80">{zhCN.story.removedDesc}</p>
              </li>
            ),
          )}
        </ul>
      ) : total === 0 ? (
        <p className="py-10 text-center text-sm text-bark-soft">{zhCN.story.removedTitle}</p>
      ) : (
        <div>
          <div key={current?.key} className="page-turn">
            {current?.entry ? (
              <article className="rounded-card border border-paper-edge bg-card p-5 shadow-soft sm:p-7">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-bark-soft">
                  <span className="flex items-center gap-1.5 rounded-full border border-paper-edge bg-paper px-2.5 py-1">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: getMood(current.entry.mood).color }}
                    />
                    {getMood(current.entry.mood).label}
                  </span>
                  <span>{formatDateHuman(current.entry.happenedOn)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{authorName(current.entry.authorId)}</span>
                </div>
                <h2 className="mb-3 font-display text-xl text-bark">{current.entry.title || '无题'}</h2>
                <div className="whitespace-pre-wrap text-[15px] leading-8 text-bark">{current.entry.content}</div>

                {detailQuery.data && detailQuery.data.mediaUrls.length > 0 ? (
                  <ul className="mt-5 grid grid-cols-3 gap-2">
                    {detailQuery.data.mediaUrls.map((url, i) => (
                      <li key={url} className="aspect-square overflow-hidden rounded-xl border border-paper-edge">
                        <img src={url} alt={detailQuery.data!.media[i]?.fileName ?? ''} className="h-full w-full object-cover" loading="lazy" />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ) : (
              <div className="rounded-card border border-dashed border-paper-edge bg-paper/70 p-8 text-center">
                <p className="font-display text-base text-bark-soft">{zhCN.story.removedTitle}</p>
                <p className="mt-2 text-sm text-bark-soft/80">{zhCN.story.removedDesc}</p>
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center justify-between">
            <Button variant="secondary" disabled={index <= 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
              ‹ {zhCN.story.prevPage}
            </Button>
            <span className="text-xs text-bark-soft">{zhCN.story.pageOf(Math.min(index + 1, total), total)}</span>
            <Button variant="secondary" disabled={index >= total - 1} onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}>
              {zhCN.story.nextPage} ›
            </Button>
          </div>
        </div>
      )}

      <div className="mt-6">
        <Link to="/story" className="text-sm text-bark-soft underline underline-offset-4">
          {zhCN.story.backToStory}
        </Link>
      </div>
    </div>
  )
}
