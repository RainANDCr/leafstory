import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { InteractIcon, LeafIcon, MailIcon } from '@/components/layout/icons'
import { t } from '@/i18n'

/**
 * 互动页（阶段 0 骨架）：
 * 心愿瓶与时光邮局将在阶段 3 开放，默契小问答将在阶段 4 开放。
 */
export function InteractPage() {
  const modules = [
    { title: t('interact.wishBottle'), desc: t('interact.wishBottleDesc'), Icon: LeafIcon, stage: '阶段 3' },
    { title: t('interact.timePost'), desc: t('interact.timePostDesc'), Icon: MailIcon, stage: '阶段 3' },
    { title: t('interact.quiz'), desc: t('interact.quizDesc'), Icon: InteractIcon, stage: '阶段 4' },
  ] as const

  return (
    <>
      <PageHeader title={t('interact.title')} description={t('interact.intro')} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map(({ title, desc, Icon, stage }) => (
          <Card key={title}>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-forest/15 text-forest">
              <Icon className="h-5.5 w-5.5" />
            </div>
            <h2 className="font-display text-base text-bark">{title}</h2>
            <p className="mt-1.5 text-sm leading-6 text-bark-soft">{desc}</p>
            <p className="mt-3">
              <span className="rounded-full border border-paper-edge bg-paper-deep px-2.5 py-1 text-[11px] text-bark-soft">
                {stage}开放
              </span>
            </p>
          </Card>
        ))}
      </div>

      <div className="mt-4">
        <EmptyState icon={<InteractIcon className="h-6 w-6" />} title={t('common.comingSoonTitle')} description={t('interact.stageNoticeWish')} />
      </div>
    </>
  )
}
