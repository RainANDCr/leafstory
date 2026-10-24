import { useState } from 'react'
import { Link } from 'react-router-dom'
import { isSupabaseConfigured } from '@/lib/env'
import { t } from '@/i18n'

/**
 * 数据库未配置提示：明确告知当前只是界面骨架、数据不会保存，
 * 并指引 .env 配置步骤。绝不假装已连接。
 */
export function SetupBanner() {
  const [dismissed, setDismissed] = useState(false)
  if (isSupabaseConfigured || dismissed) return null

  return (
    <div role="note" className="mb-4 rounded-card border border-leaf-gold/40 bg-leaf-gold/10 p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-leaf-gold" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-bark">{t('setupBanner.title')}</p>
          <p className="mt-1 text-sm leading-6 text-bark-soft">{t('setupBanner.body')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="min-h-9 rounded-xl bg-bark px-3 text-xs font-medium text-paper transition-colors hover:bg-bark-deep"
            >
              {t('setupBanner.dismiss')}
            </button>
            <Link
              to="/settings"
              className="flex min-h-9 items-center rounded-xl border border-paper-edge bg-card px-3 text-xs font-medium text-bark transition-colors hover:bg-paper-deep"
            >
              {t('setupBanner.goToSettings')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
