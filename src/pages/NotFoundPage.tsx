import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/ui/EmptyState'
import { LeafIcon } from '@/components/layout/icons'
import { t } from '@/i18n'

export function NotFoundPage() {
  return (
    <div className="py-8">
      <EmptyState
        icon={<LeafIcon className="h-6 w-6" />}
        title={t('notFound.title')}
        description={t('notFound.desc')}
        action={
          <Link to="/forest" className="inline-flex min-h-11 items-center rounded-2xl bg-bark px-4 text-sm font-medium text-paper transition-colors hover:bg-bark-deep">
            {t('common.backHome')}
          </Link>
        }
      />
    </div>
  )
}
