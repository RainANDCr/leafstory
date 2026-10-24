/** 年度金叶打印页：确定性统计 + 用户选择，一页 A4 呈现 */
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PrintShell } from '@/components/print/PrintShell'
import { LoadingState } from '@/components/feedback/LoadingState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { buildYearStats } from '@/features/yearly/logic'
import { useCoupleSnapshot } from '@/features/couple/useCoupleSnapshot'
import { listVisibleDiariesForStory } from '@/services/diaryService'
import { listWishes } from '@/services/wishService'
import { listAnniversaries } from '@/services/anniversaryService'
import { listPlaces } from '@/services/placeService'
import { getGoldenLeaf } from '@/services/goldenLeafService'
import { kindLabel } from '@/features/anniversaries/ui'
import { formatDateHuman } from '@/lib/dates'
import { zhCN } from '@/i18n'

export function PrintGoldenPage() {
  const { year: yearParam } = useParams()
  const year = Number(yearParam) || new Date().getFullYear()
  const coupleQuery = useCoupleSnapshot()
  const coupleId = coupleQuery.data?.info?.coupleId ?? null

  const diaries = useQuery({
    queryKey: ['storyDiaries', coupleId],
    queryFn: () => listVisibleDiariesForStory(),
    enabled: Boolean(coupleId),
  })
  const wishes = useQuery({ queryKey: ['wishes', coupleId], queryFn: () => listWishes(coupleId!), enabled: Boolean(coupleId) })
  const ann = useQuery({ queryKey: ['anniversaries', coupleId], queryFn: () => listAnniversaries(coupleId!), enabled: Boolean(coupleId) })
  const places = useQuery({ queryKey: ['places', coupleId], queryFn: () => listPlaces(coupleId!), enabled: Boolean(coupleId) })
  const leaf = useQuery({ queryKey: ['goldenLeaf', coupleId, year], queryFn: () => getGoldenLeaf(coupleId!, year), enabled: Boolean(coupleId) })

  if (coupleQuery.isLoading || diaries.isLoading) return <LoadingState />
  if (coupleQuery.isError || diaries.isError) return <ErrorState message={zhCN.errors.unknown} />

  const stats = buildYearStats(year, diaries.data ?? [], wishes.data ?? [], places.data ?? [])
  const goldMoments = [
    ...(ann.data ?? [])
      .filter((a) => a.anniversaryDate.startsWith(String(year)))
      .map((a) => `${a.title}（${kindLabel(a.kind)}）`),
    ...(wishes.data ?? [])
      .filter((w) => w.status === 'done' && (w.completedAt ?? '').startsWith(String(year)))
      .map((w) => `${w.title}（${zhCN.wishes.statusDone}）`),
  ]

  return (
    <PrintShell title={`${zhCN.yearly.title} · ${year} · ${leaf.data?.title ?? ''}`}>
      <div className="print-card rounded-card p-5">
        <p className="font-display text-lg text-bark">
          {[
            zhCN.yearly.statDiaries(stats.diaryCount),
            zhCN.yearly.statPhotos(stats.photoCount),
            zhCN.yearly.statCities(stats.cityCount),
            zhCN.yearly.statWishes(stats.wishDoneCount),
          ].join(' · ')}
        </p>
        {leaf.data?.preciousDay ? (
          <p className="mt-3 text-sm text-bark">
            {zhCN.yearly.preciousTitle}：{formatDateHuman(leaf.data.preciousDay)}
          </p>
        ) : null}

        <div className="mt-5 flex h-24 items-end gap-1">
          {stats.monthly.map((count, i) => {
            const max = Math.max(...stats.monthly, 1)
            return (
              <div key={i} className="flex flex-1 flex-col items-center">
                <div className="w-full rounded-t bg-[#C99D4A]/70" style={{ height: `${Math.max((count / max) * 70, count > 0 ? 6 : 2)}px` }} />
                <span className="mt-1 text-[9px] text-bark-soft">{i + 1}</span>
              </div>
            )
          })}
        </div>

        {goldMoments.length > 0 ? (
          <>
            <p className="mt-6 text-sm font-medium text-bark">{zhCN.yearly.goldMomentsTitle}</p>
            <ul className="mt-2 list-disc pl-5 text-sm leading-7 text-bark">
              {goldMoments.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </PrintShell>
  )
}
