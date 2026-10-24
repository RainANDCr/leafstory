/** 日记卡片：时间轴列表项 */
import { Link } from 'react-router-dom'
import { formatDateShort } from '@/lib/dates'
import { getMood, type DiaryEntry } from '../types'
import { zhCN, t } from '@/i18n'

interface DiaryCardProps {
  entry: DiaryEntry
  authorName: string
}

export function DiaryCard({ entry, authorName }: DiaryCardProps) {
  const mood = getMood(entry.mood)
  const snippet = entry.content.length > 90 ? `${entry.content.slice(0, 90)}…` : entry.content

  return (
    <li>
      <Link
        to={`/diary/${entry.id}`}
        className="block rounded-card border border-paper-edge bg-card p-4 shadow-soft transition-colors hover:bg-paper-deep/60"
      >
        <div className="flex items-center gap-2 text-xs text-bark-soft">
          <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: mood.color }} />
          <span>{formatDateShort(entry.happenedOn)}</span>
          <span aria-hidden="true">·</span>
          <span>{entry.authorId ? authorName : ''}</span>
          {entry.mediaCount && entry.mediaCount > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{zhCN.diary.photosCount(entry.mediaCount)}</span>
            </>
          ) : null}
          {entry.status === 'draft' ? (
            <span className="rounded-full border border-leaf-gold/50 bg-leaf-gold/15 px-2 py-0.5 text-[11px] text-bark">
              {t('diary.draftBadge')}
            </span>
          ) : null}
          {entry.visibility === 'private' ? (
            <span className="rounded-full border border-paper-edge bg-paper-deep px-2 py-0.5 text-[11px] text-bark-soft">
              {t('diary.privateBadge')}
            </span>
          ) : null}
        </div>
        <h3 className="mt-1.5 font-display text-base text-bark">{entry.title || '无题'}</h3>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-bark-soft">{snippet}</p>
      </Link>
    </li>
  )
}
