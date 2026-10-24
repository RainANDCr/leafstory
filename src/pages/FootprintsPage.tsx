import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { FootprintsIcon, LeafIcon } from '@/components/layout/icons'
import { t } from '@/i18n'

/**
 * 足迹页（阶段 0 骨架）：
 * 地图与地点管理在阶段 4 开放；纪念日列表在阶段 1 开放。
 */
export function FootprintsPage() {
  return (
    <>
      <PageHeader title={t('footprints.title')} description={t('footprints.intro')} />

      {/* 地图占位：阶段 4 上线，届时同时提供无地图也可用的足迹列表 */}
      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-medium text-bark-soft">{t('footprints.mapTitle')}</h2>
        <div className="flex h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-paper-edge bg-gradient-to-b from-paper-deep to-paper">
          <FootprintsIcon className="mb-3 h-8 w-8 text-leaf-gold" />
          <p className="font-display text-base text-bark">{t('footprints.mapPlaceholder')}</p>
          <p className="mt-1.5 max-w-xs text-center text-xs leading-5 text-bark-soft">{t('footprints.mapTeaser')}</p>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-medium text-bark-soft">{t('footprints.anniversariesTitle')}</h2>
        <EmptyState
          icon={<LeafIcon className="h-6 w-6" />}
          title={t('footprints.emptyAnniversaries')}
          description={t('footprints.emptyAnniversariesDesc')}
        />
      </Card>
    </>
  )
}
