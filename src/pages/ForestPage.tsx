import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { MemoryTree } from '@/features/forest/components/MemoryTree'
import { MonkeyMascot } from '@/components/MonkeyMascot'
import { LeafIcon } from '@/components/layout/icons'
import { dailyPrompt } from '@/features/forest/dailyPrompt'
import { t } from '@/i18n'

/**
 * 森林首页（阶段 0 骨架）：
 * 占位回忆之树 + 小猴守护者 + 今日提示 + 空状态入口。
 * 阶段 1 起接入真实日记与纪念日数据。
 */
export function ForestPage() {
  const navigate = useNavigate()
  return (
    <>
      <PageHeader title={t('forest.title')} description={t('forest.intro')} />

      {/* 回忆之树 */}
      <div className="relative mb-2">
        <MemoryTree className="mx-auto w-full max-w-sm" />
        <MonkeyMascot className="absolute bottom-2 left-1 w-20 sm:w-24" />
      </div>
      <p className="mb-6 text-center font-display text-lg text-bark">{t('app.tagline')}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* 今日小提示：确定性轮换，不推断情感 */}
        <Card>
          <h2 className="mb-1.5 text-sm font-medium text-bark-soft">{t('forest.todayHintTitle')}</h2>
          <p className="leading-7 text-bark">{dailyPrompt()}</p>
        </Card>

        {/* 下一个纪念日（阶段 1 接入真实数据） */}
        <Card>
          <h2 className="mb-1.5 text-sm font-medium text-bark-soft">{t('forest.nextAnniversaryTitle')}</h2>
          <p className="leading-7 text-bark-soft">{t('forest.emptyAnniversary')}</p>
        </Card>
      </div>

      {/* 最近回忆 */}
      <div className="mt-4">
        <EmptyState
          icon={<LeafIcon className="h-6 w-6" />}
          title={t('forest.emptyRecent')}
          description={t('forest.emptyRecentDesc')}
          action={<Button onClick={() => navigate('/diary')}>{t('forest.goWrite')}</Button>}
        />
      </div>
    </>
  )
}
