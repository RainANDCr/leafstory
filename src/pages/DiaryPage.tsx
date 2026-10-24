import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { ComingSoonNote } from '@/components/ui/ComingSoonNote'
import { DiaryIcon } from '@/components/layout/icons'
import { t } from '@/i18n'

/** 日记页（阶段 0 骨架）：写作、搜索与时间轴将在阶段 1 开放 */
export function DiaryPage() {
  return (
    <>
      <PageHeader title={t('diary.title')} description={t('diary.intro')} />
      <ComingSoonNote note={t('diary.stageNotice')} />
      <div className="mt-4">
        <EmptyState
          icon={<DiaryIcon className="h-6 w-6" />}
          title={t('diary.emptyTitle')}
          description={t('diary.emptyDesc')}
        />
      </div>
    </>
  )
}
