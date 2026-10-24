import { Card } from '@/components/ui/Card'
import { ComingSoonNote } from '@/components/ui/ComingSoonNote'
import { MonkeyMascot } from '@/components/MonkeyMascot'
import { t } from '@/i18n'

/** 配对页（阶段 0 骨架）：阶段 1 实现短期有效的邀请码配对 */
export function PairingPage() {
  return (
    <div className="mx-auto max-w-md py-6">
      <Card className="text-center">
        <MonkeyMascot className="mx-auto w-28" label="" />
        <h1 className="mt-2 font-display text-2xl text-bark">{t('pairing.title')}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-bark-soft">{t('pairing.desc')}</p>
        <div className="mt-5 text-left">
          <ComingSoonNote note={t('pairing.stageNotice')} />
        </div>
      </Card>
    </div>
  )
}
