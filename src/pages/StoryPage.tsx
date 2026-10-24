import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { ComingSoonNote } from '@/components/ui/ComingSoonNote'
import { StoryIcon } from '@/components/layout/icons'
import { t } from '@/i18n'

/** 故事页（阶段 0 骨架）：月度/年度故事书与自定义专题将在阶段 2 开放 */
export function StoryPage() {
  return (
    <>
      <PageHeader title={t('story.title')} description={t('story.intro')} />
      <ComingSoonNote note={t('story.stageNotice')} />
      <div className="mt-4">
        <EmptyState icon={<StoryIcon className="h-6 w-6" />} title={t('story.emptyTitle')} description={t('story.emptyDesc')} />
      </div>
    </>
  )
}
