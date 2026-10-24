import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { isSupabaseConfigured } from '@/lib/env'
import { t } from '@/i18n'

interface SettingRowProps {
  title: string
  desc: string
  /** 右侧状态标签；不传则不显示 */
  badge?: string
}

function SettingRow({ title, desc, badge }: SettingRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-paper-edge/70 py-3.5 last:border-b-0">
      <div className="min-w-0">
        <h2 className="text-sm font-medium text-bark">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-bark-soft">{desc}</p>
      </div>
      {badge ? (
        <span className="mt-0.5 shrink-0 rounded-full border border-paper-edge bg-paper-deep px-2.5 py-1 text-[11px] text-bark-soft">
          {badge}
        </span>
      ) : null}
    </div>
  )
}

/** 设置页（阶段 0 骨架）：账户、配对、偏好、隐私与 AI 的入口说明 */
export function SettingsPage() {
  const comingSoon = t('settings.comingSoon')
  return (
    <>
      <PageHeader title={t('settings.title')} description={t('settings.intro')} />

      {/* 服务连接状态：如实反映 .env 配置情况 */}
      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-medium text-bark-soft">{t('settings.connectionTitle')}</h2>
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 rounded-full ${isSupabaseConfigured ? 'bg-forest' : 'bg-maple'}`}
          />
          <p className="text-sm text-bark">{isSupabaseConfigured ? t('settings.connected') : t('settings.notConnected')}</p>
        </div>
        {!isSupabaseConfigured ? <p className="mt-2 text-xs leading-5 text-bark-soft">{t('settings.notConnectedHint')}</p> : null}
      </Card>

      <Card>
        <SettingRow title={t('settings.account')} desc={t('settings.accountDesc')} badge={comingSoon} />
        <SettingRow title={t('settings.pairing')} desc={t('settings.pairingDesc')} badge={comingSoon} />
        <SettingRow title={t('settings.preferences')} desc={t('settings.preferencesDesc')} badge={comingSoon} />
        <SettingRow title={t('settings.privacy')} desc={t('settings.privacyDesc')} />
        <SettingRow title={t('settings.ai')} desc={t('settings.aiDesc')} badge={comingSoon} />
        <SettingRow title={t('settings.dataManagement')} desc={t('settings.dataManagementDesc')} badge={comingSoon} />
      </Card>
    </>
  )
}
