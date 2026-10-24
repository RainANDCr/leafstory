/** 纪念日提醒开关：默认关闭；开启即请求通知权限（Android），Web 如实提示不支持 */
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useCoupleSnapshot } from '@/features/couple/useCoupleSnapshot'
import { listAnniversaries } from '@/services/anniversaryService'
import { platform } from '@/platform'
import {
  disableNotifications,
  enableNotifications,
  isNotificationPrefOn,
  rescheduleNotifications,
} from '@/features/anniversaries/notifications'
import { zhCN } from '@/i18n'

export function AnniversaryNotificationToggle() {
  const coupleQuery = useCoupleSnapshot()
  const coupleId = coupleQuery.data?.info?.coupleId ?? null
  const anniversariesQuery = useQuery({
    queryKey: ['anniversaries', coupleId],
    queryFn: () => listAnniversaries(coupleId!),
    enabled: Boolean(coupleId),
  })

  const [on, setOn] = useState(() => isNotificationPrefOn())
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [supported, setSupported] = useState<boolean | null>(null)

  useEffect(() => {
    // 异步探测平台能力（异步回调中的 setState 不触发级联渲染问题）
    void platform.notifications.isAvailable().then(setSupported)
  }, [])

  // 偏好开启时，纪念日变化后幂等重排提醒
  useEffect(() => {
    if (on && anniversariesQuery.data) {
      void rescheduleNotifications(anniversariesQuery.data)
    }
  }, [on, anniversariesQuery.data])

  async function toggle(next: boolean) {
    setBusy(true)
    setNotice('')
    try {
      if (next) {
        const ok = await enableNotifications(anniversariesQuery.data ?? [])
        setOn(ok)
        setNotice(ok ? '' : zhCN.settings.notifyDenied)
      } else {
        await disableNotifications(anniversariesQuery.data ?? [])
        setOn(false)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-bark">{zhCN.settings.notifyLabel}</span>
        <input type="checkbox" className="h-5 w-5 accent-bark" checked={on} disabled={busy} onChange={(e) => void toggle(e.target.checked)} />
      </label>
      <p className="mt-1.5 text-xs leading-5 text-bark-soft">
        {supported === false ? zhCN.settings.notifyWebUnsupported : zhCN.settings.notifyHint}
      </p>
      {notice ? <p className="mt-1 text-xs text-maple">{notice}</p> : null}
    </div>
  )
}
