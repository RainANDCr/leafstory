/**
 * 设置页：服务连接状态、账户（昵称/时区）、二人空间状态、隐私说明、后续阶段入口。
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { AiSettingsCard } from '@/features/ai/AiSettingsCard'
import { useAuth } from '@/features/auth/AuthContext'
import { useCoupleSnapshot, partnerOf } from '@/features/couple/useCoupleSnapshot'
import { getProfile, updateProfile, type Profile } from '@/services/profileService'
import { signOut } from '@/services/authService'
import { isSupabaseConfigured } from '@/lib/env'
import { t } from '@/i18n'

const TIMEZONES = [
  'Asia/Shanghai',
  'Asia/Taipei',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
]

interface SettingRowProps {
  title: string
  desc: string
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

/** 账户卡片：经 key 重挂载初始化本地编辑状态，避免 effect 同步 */
function AccountCard({ profile, email }: { profile: Profile; email: string }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [nickname, setNickname] = useState(profile.nickname)
  const [timezone, setTimezone] = useState(profile.timezone)
  const [nicknameSaved, setNicknameSaved] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)

  const saveMutation = useMutation({
    mutationFn: () => updateProfile(profile.id, { nickname: nickname.trim(), timezone }),
    onSuccess: () => {
      setNicknameSaved(true)
      setTimeout(() => setNicknameSaved(false), 2000)
      void qc.invalidateQueries({ queryKey: ['profile'] })
      void qc.invalidateQueries({ queryKey: ['couple'] })
    },
  })

  const inputCls = 'w-full min-h-11 rounded-2xl border border-paper-edge bg-paper px-3.5 py-2 text-sm text-bark'

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-bark" htmlFor="set-email">
          {t('settings.accountEmail')}
        </label>
        <input id="set-email" className={`${inputCls} mt-1 bg-paper-deep`} value={email} readOnly />
      </div>
      <div>
        <label className="block text-sm font-medium text-bark" htmlFor="set-nickname">
          {t('settings.accountNickname')}
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="set-nickname"
            className={inputCls}
            placeholder={t('settings.nicknamePlaceholder')}
            maxLength={30}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || nickname.trim().length === 0}>
            {saveMutation.isPending ? t('common.saving') : t('settings.saveNickname')}
          </Button>
        </div>
        {nicknameSaved ? <p className="mt-1.5 text-xs text-forest-deep">{t('settings.nicknameSaved')}</p> : null}
        {saveMutation.isError ? <p className="mt-1.5 text-xs text-maple">{t('errors.unknown')}</p> : null}
      </div>
      <div>
        <label className="block text-sm font-medium text-bark" htmlFor="set-timezone">
          {t('settings.timezone')}
        </label>
        <select
          id="set-timezone"
          className={`${inputCls} mt-1`}
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        >
          {(TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES]).map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-bark-soft">{t('settings.timezoneHint')}</p>
      </div>
      <Button variant="secondary" onClick={() => setSignOutOpen(true)}>
        {t('settings.signOut')}
      </Button>

      <ConfirmDialog
        open={signOutOpen}
        title={t('settings.signOutConfirm')}
        confirmLabel={t('settings.signOut')}
        onConfirm={() => {
          setSignOutOpen(false)
          void signOut().then(() => navigate('/login', { replace: true }))
        }}
        onCancel={() => setSignOutOpen(false)}
      />
    </div>
  )
}

export function SettingsPage() {
  const navigate = useNavigate()
  const { userId, email } = useAuth()
  const coupleQuery = useCoupleSnapshot()

  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => getProfile(userId as string),
    enabled: Boolean(userId),
  })

  const couple = coupleQuery.data
  const partner = partnerOf(couple?.info ?? null, userId)
  const comingSoon = t('settings.comingSoon')

  return (
    <>
      <PageHeader title={t('settings.title')} description={t('settings.intro')} />

      {/* 数据与连接：如实区分云端与本地模式 */}
      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-medium text-bark-soft">{t('settings.connectionTitle')}</h2>
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 rounded-full ${isSupabaseConfigured ? 'bg-forest' : 'bg-leaf-gold'}`}
          />
          <p className="text-sm text-bark">
            {isSupabaseConfigured ? t('settings.connected') : t('settings.connectionLocal')}
          </p>
        </div>
        <p className="mt-2 text-xs leading-5 text-bark-soft">
          {isSupabaseConfigured ? '' : t('settings.localModeHint')}
        </p>
      </Card>

      {/* 账户 */}
      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-medium text-bark-soft">{t('settings.accountTitle')}</h2>
        {userId ? (
          profileQuery.isLoading ? (
            <p className="text-sm text-bark-soft">{t('common.loading')}</p>
          ) : profileQuery.data ? (
            <AccountCard key={profileQuery.data.id} profile={profileQuery.data} email={email ?? ''} />
          ) : (
            <p className="text-sm text-bark-soft">{t('errors.unknown')}</p>
          )
        ) : (
          <p className="text-sm text-bark-soft">{t('common.loginRequired')}</p>
        )}
      </Card>

      {/* 二人空间 */}
      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-medium text-bark-soft">{t('settings.coupleTitle')}</h2>
        {couple?.state === 'paired' ? (
          <div className="space-y-2">
            <p className="text-sm text-bark">
              {t('settings.couplePaired')} · {partner?.nickname ?? 'TA'}
            </p>
            <p className="text-xs leading-5 text-bark-soft">{t('settings.unpairHint')}</p>
          </div>
        ) : couple?.state === 'waiting' ? (
          <div className="space-y-3">
            <p className="text-sm text-bark">{t('settings.coupleWaiting')}</p>
            <Button variant="secondary" onClick={() => navigate('/pairing')}>
              {t('pairing.regenerate')}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-bark-soft">{t('settings.coupleUnpairedHint')}</p>
            <Button variant="secondary" onClick={() => navigate('/pairing')}>
              {t('settings.goPairing')}
            </Button>
          </div>
        )}
      </Card>

      {/* AI（BYOK）：真实配置卡片，Key 仅内存 */}
      <AiSettingsCard />

      {/* 其余条目 */}
      <Card>
        <SettingRow title={t('settings.privacy')} desc={t('settings.privacyDesc')} />
        <SettingRow title={t('settings.dataManagement')} desc={t('settings.dataManagementDesc')} badge={comingSoon} />
      </Card>
    </>
  )
}
