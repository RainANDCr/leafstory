import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { t } from '@/i18n'

/** 登录页（阶段 0 骨架）：阶段 1 接入 Supabase Auth */
export function LoginPage() {
  return (
    <div className="mx-auto max-w-sm py-8">
      <Card className="text-center">
        <h1 className="font-display text-2xl text-bark">{t('login.title')}</h1>
        <p className="mt-2 text-sm leading-6 text-bark-soft">{t('login.desc')}</p>
        <Link to="/forest" className="mt-5 inline-flex min-h-11 items-center rounded-2xl bg-bark px-4 text-sm font-medium text-paper transition-colors hover:bg-bark-deep">
          {t('login.backToForest')}
        </Link>
      </Card>
    </div>
  )
}
