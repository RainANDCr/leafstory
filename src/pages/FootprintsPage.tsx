/**
 * 足迹页（阶段 4 完整版）：
 * - 「地点足迹」：地图（Leaflet/OSM，可替换）与列表双视图、按地区/年份/特殊
 *   筛选、特殊地点标记、统计（不评价）、CRUD；定位仅逐次授权；
 * - 「纪念日」：阶段 1 的纪念日管理不变。
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FootprintsIcon, LeafIcon } from '@/components/layout/icons'
import { AnniversaryFormDialog } from '@/features/anniversaries/AnniversaryFormDialog'
import { countdownText, isGoldKind, kindLabel, nextAnniversary, sortForDisplay, withCountdown } from '@/features/anniversaries/ui'
import { MapView } from '@/features/places/MapView'
import { PlaceFormDialog } from '@/features/places/PlaceFormDialog'
import { useAuth } from '@/features/auth/AuthContext'
import { useCoupleSnapshot } from '@/features/couple/useCoupleSnapshot'
import {
  createAnniversary,
  deleteAnniversary,
  listAnniversaries,
  updateAnniversary,
  type Anniversary,
  type AnniversaryInput,
} from '@/services/anniversaryService'
import { createPlace, deletePlace, listPlaces, updatePlace, type Place, type PlaceInput } from '@/services/placeService'
import { listSharedDiariesForTree } from '@/services/diaryService'
import { formatDateHuman } from '@/lib/dates'
import { getErrorMessage } from '@/lib/errors'
import { t, zhCN } from '@/i18n'

type Tab = 'places' | 'anniversaries'

export function FootprintsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { userId } = useAuth()
  const coupleQuery = useCoupleSnapshot()
  const couple = coupleQuery.data?.info ?? null
  const coupleId = couple?.coupleId ?? null

  const [tab, setTab] = useState<Tab>('places')

  // ---- 地点状态 ----
  const [view, setView] = useState<'map' | 'list'>('list')
  const [cityFilter, setCityFilter] = useState('')
  const [yearFilter, setYearFilter] = useState('')
  const [specialOnly, setSpecialOnly] = useState(false)
  const [placeFormOpen, setPlaceFormOpen] = useState(false)
  const [editingPlace, setEditingPlace] = useState<Place | null>(null)
  const [deletingPlace, setDeletingPlace] = useState<Place | null>(null)

  // ---- 纪念日状态 ----
  const [annFormOpen, setAnnFormOpen] = useState(false)
  const [editingAnn, setEditingAnn] = useState<Anniversary | null>(null)
  const [deletingAnn, setDeletingAnn] = useState<Anniversary | null>(null)
  const [actionError, setActionError] = useState('')

  const placesQuery = useQuery({
    queryKey: ['places', coupleId],
    queryFn: () => listPlaces(coupleId!),
    enabled: Boolean(coupleId),
  })

  const anniversariesQuery = useQuery({
    queryKey: ['anniversaries', coupleId],
    queryFn: () => listAnniversaries(coupleId!),
    enabled: Boolean(coupleId),
  })

  const sharedDiariesQuery = useQuery({
    queryKey: ['sharedDiaries', coupleId],
    queryFn: () => listSharedDiariesForTree(100),
    enabled: Boolean(coupleId),
    staleTime: 60_000,
  })

  const placeSave = useMutation({
    mutationFn: async (input: PlaceInput) => {
      if (!coupleId || !userId) throw new Error('未配对')
      if (editingPlace) await updatePlace(editingPlace.id, input, userId)
      else await createPlace(coupleId, userId, input)
    },
    onSuccess: () => {
      setPlaceFormOpen(false)
      setEditingPlace(null)
      setActionError('')
      void qc.invalidateQueries({ queryKey: ['places'] })
    },
    onError: (err) => setActionError(getErrorMessage(err)),
  })

  const placeDelete = useMutation({
    mutationFn: (id: string) => deletePlace(id),
    onSuccess: () => {
      setDeletingPlace(null)
      void qc.invalidateQueries({ queryKey: ['places'] })
    },
    onError: (err) => {
      setActionError(getErrorMessage(err))
      setDeletingPlace(null)
    },
  })

  const annSave = useMutation({
    mutationFn: async (input: AnniversaryInput) => {
      if (!coupleId) throw new Error('未配对')
      if (editingAnn) await updateAnniversary(editingAnn.id, input)
      else await createAnniversary(coupleId, userId ?? '', input)
    },
    onSuccess: () => {
      setAnnFormOpen(false)
      setEditingAnn(null)
      setActionError('')
      void qc.invalidateQueries({ queryKey: ['anniversaries'] })
    },
    onError: (err) => setActionError(getErrorMessage(err)),
  })

  const annDelete = useMutation({
    mutationFn: (id: string) => deleteAnniversary(id),
    onSuccess: () => {
      setDeletingAnn(null)
      void qc.invalidateQueries({ queryKey: ['anniversaries'] })
    },
    onError: (err) => {
      setActionError(getErrorMessage(err))
      setDeletingAnn(null)
    },
  })

  if (coupleQuery.isLoading) return <LoadingState />
  if (coupleQuery.isError) {
    return <ErrorState message={getErrorMessage(coupleQuery.error)} onRetry={() => void qc.invalidateQueries({ queryKey: ['couple'] })} />
  }
  if (!couple) {
    return (
      <>
        <PageHeader title={t('footprints.title')} description={t('footprints.intro')} />
        <EmptyState
          icon={<LeafIcon className="h-6 w-6" />}
          title={t('forest.needPairing')}
          description={t('forest.needPairingDesc')}
          action={<Button onClick={() => navigate('/pairing')}>{t('forest.goPairing')}</Button>}
        />
      </>
    )
  }

  const places = placesQuery.data ?? []
  const cities = Array.from(new Set(places.map((p) => p.region).filter((r): r is string => Boolean(r))))
  const years = Array.from(new Set(places.map((p) => p.happenedOn?.slice(0, 4)).filter((y): y is string => Boolean(y)))).sort().reverse()
  const filteredPlaces = places.filter(
    (p) =>
      (cityFilter === '' || p.region === cityFilter) &&
      (yearFilter === '' || p.happenedOn?.slice(0, 4) === yearFilter) &&
      (!specialOnly || p.isSpecial),
  )
  const cityCount = new Set(places.map((p) => p.region).filter(Boolean)).size

  const anniversaries = withCountdown(anniversariesQuery.data ?? [])
  const sorted = sortForDisplay(anniversaries)
  const next = nextAnniversary(anniversaries)
  const sharedDiaries = sharedDiariesQuery.data ?? []

  return (
    <>
      <PageHeader
        title={t('footprints.title')}
        description={t('footprints.intro')}
        actions={
          tab === 'places' ? (
            <Button
              variant="secondary"
              onClick={() => {
                setEditingPlace(null)
                setPlaceFormOpen(true)
              }}
            >
              {t('footprints.addPlace')}
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => {
                setEditingAnn(null)
                setAnnFormOpen(true)
              }}
            >
              {t('anniversaries.add')}
            </Button>
          )
        }
      />

      {/* 主标签：地点足迹 / 纪念日 */}
      <div className="mb-4 flex w-fit rounded-2xl bg-paper-deep p-1 text-sm" role="tablist">
        {(
          [
            ['places', t('footprints.tabPlaces')],
            ['anniversaries', t('footprints.tabAnniversaries')],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={`min-h-10 rounded-xl px-4 transition-colors ${tab === value ? 'bg-card text-bark shadow-soft' : 'text-bark-soft'}`}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {actionError ? (
        <p role="alert" className="mb-4 rounded-2xl border border-maple/40 bg-maple/5 p-3 text-sm text-maple">
          {actionError}
        </p>
      ) : null}

      {tab === 'places' ? (
        <>
          {/* 视图切换 + 筛选 */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex rounded-2xl bg-paper-deep p-1 text-xs">
              {(
                [
                  ['list', t('footprints.listView')],
                  ['map', t('footprints.mapView')],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  className={`min-h-9 rounded-xl px-3.5 transition-colors ${view === value ? 'bg-card text-bark shadow-soft' : 'text-bark-soft'}`}
                  onClick={() => setView(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              aria-label={t('footprints.filterAllCities')}
              className="min-h-9 rounded-full border border-paper-edge bg-card px-3 text-xs text-bark"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
            >
              <option value="">{t('footprints.filterAllCities')}</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              aria-label={t('footprints.filterAllYears')}
              className="min-h-9 rounded-full border border-paper-edge bg-card px-3 text-xs text-bark"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
            >
              <option value="">{t('footprints.filterAllYears')}</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <label className="flex min-h-9 items-center gap-2 text-xs text-bark-soft">
              <input type="checkbox" className="h-4 w-4 accent-bark" checked={specialOnly} onChange={(e) => setSpecialOnly(e.target.checked)} />
              {t('footprints.filterSpecial')}
            </label>
          </div>

          {places.length > 0 ? (
            <p className="mb-4 text-xs text-bark-soft">
              {zhCN.footprints.stats(places.length, cityCount)} · {t('footprints.statsHint')}
            </p>
          ) : null}

          {placesQuery.isLoading ? (
            <LoadingState />
          ) : placesQuery.isError ? (
            <ErrorState message={getErrorMessage(placesQuery.error)} onRetry={() => void placesQuery.refetch()} />
          ) : places.length === 0 ? (
            <EmptyState
              icon={<FootprintsIcon className="h-6 w-6" />}
              title={t('footprints.emptyTitle')}
              description={t('footprints.emptyDesc')}
              action={<Button onClick={() => setPlaceFormOpen(true)}>{t('footprints.addPlace')}</Button>}
            />
          ) : view === 'map' ? (
            <MapView places={filteredPlaces} />
          ) : (
            <ul className="space-y-3">
              {filteredPlaces.map((place) => (
                <li key={place.id}>
                  <Card className={`!p-4 ${place.isSpecial ? 'border-leaf-gold/50' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-base text-bark">{place.name}</h3>
                          {place.isSpecial ? (
                            <span className="rounded-full bg-leaf-gold/20 px-2 py-0.5 text-[11px] text-bark">
                              ✦ {zhCN.footprints.specialBadge(place.specialLabel ?? '')}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-bark-soft">
                          {[place.region, place.happenedOn ? formatDateHuman(place.happenedOn) : null].filter(Boolean).join(' · ')}
                          {place.latitude !== null ? ' · 📍' : ''}
                        </p>
                        {place.note ? <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-bark-soft">{place.note}</p> : null}
                        {place.linkedDiaries.length > 0 ? (
                          <p className="mt-1.5 flex flex-wrap gap-2">
                            {place.linkedDiaries.map((d) => (
                              <Link key={d.id} to={`/diary/${d.id}`} className="text-xs text-leaf-gold underline underline-offset-2">
                                🍂 {d.title || '无题'}
                              </Link>
                            ))}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-2 text-xs">
                        <button
                          type="button"
                          className="text-bark-soft underline underline-offset-2 hover:text-bark"
                          onClick={() => {
                            setEditingPlace(place)
                            setPlaceFormOpen(true)
                          }}
                        >
                          {t('common.edit')}
                        </button>
                        <button type="button" className="text-maple underline underline-offset-2" onClick={() => setDeletingPlace(place)}>
                          {t('common.delete')}
                        </button>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
              {filteredPlaces.length === 0 ? (
                <li>
                  <EmptyState title={t('diary.emptySearchTitle')} description={t('diary.emptySearchDesc')} />
                </li>
              ) : null}
            </ul>
          )}
        </>
      ) : (
        <Card>
          {next ? (
            <div className="mb-4 rounded-2xl border border-leaf-gold/40 bg-leaf-gold/10 p-4">
              <p className="text-xs text-bark-soft">{t('anniversaries.nextLabel')}</p>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <p className="font-display text-base text-bark">{next.title}</p>
                <p className="text-sm font-medium text-bark">{countdownText(next)}</p>
              </div>
            </div>
          ) : null}

          {anniversariesQuery.isError ? (
            <ErrorState message={getErrorMessage(anniversariesQuery.error)} onRetry={() => void anniversariesQuery.refetch()} />
          ) : anniversariesQuery.isLoading ? (
            <LoadingState />
          ) : sorted.length === 0 ? (
            <EmptyState
              icon={<LeafIcon className="h-6 w-6" />}
              title={t('anniversaries.emptyTitle')}
              description={t('anniversaries.emptyDesc')}
            />
          ) : (
            <ul className="space-y-3">
              {sorted.map((item) => (
                <li
                  key={item.id}
                  className={`flex items-start justify-between gap-3 rounded-2xl border bg-card p-4 ${
                    isGoldKind(item.kind) ? 'border-leaf-gold/50' : 'border-paper-edge'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-base text-bark">{item.title}</h3>
                      <span className="rounded-full border border-paper-edge bg-paper-deep px-2 py-0.5 text-[11px] text-bark-soft">
                        {kindLabel(item.kind)}
                      </span>
                      {isGoldKind(item.kind) ? (
                        <span title={t('anniversaries.goldKindHint')} aria-label={t('anniversaries.goldKindHint')}>
                          <LeafIcon className="h-4 w-4 text-leaf-gold" />
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-bark-soft">
                      {formatDateHuman(item.anniversaryDate)}
                      {item.repeatsYearly ? ` · ${t('anniversaries.repeatYearly')}` : ''}
                    </p>
                    {item.note ? <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-bark-soft">{item.note}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs ${
                        item.countdown.status === 'today' ? 'bg-leaf-gold/20 font-medium text-bark' : 'bg-paper-deep text-bark-soft'
                      }`}
                    >
                      {countdownText(item)}
                    </span>
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        className="text-bark-soft underline underline-offset-2 hover:text-bark"
                        onClick={() => {
                          setEditingAnn(item)
                          setAnnFormOpen(true)
                        }}
                      >
                        {t('common.edit')}
                      </button>
                      <button type="button" className="text-maple underline underline-offset-2" onClick={() => setDeletingAnn(item)}>
                        {t('common.delete')}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <PlaceFormDialog
        open={placeFormOpen}
        initial={editingPlace}
        entries={sharedDiaries}
        busy={placeSave.isPending}
        onSubmit={(input) => placeSave.mutate(input)}
        onCancel={() => {
          setPlaceFormOpen(false)
          setEditingPlace(null)
        }}
      />

      <ConfirmDialog
        open={deletingPlace !== null}
        title={t('common.confirmDeleteTitle')}
        description={`「${deletingPlace?.name ?? ''}」${t('common.confirmDeleteNoUndo')}`}
        confirmLabel={t('common.delete')}
        danger
        busy={placeDelete.isPending}
        onConfirm={() => deletingPlace && placeDelete.mutate(deletingPlace.id)}
        onCancel={() => setDeletingPlace(null)}
      />

      <AnniversaryFormDialog
        open={annFormOpen}
        initial={editingAnn}
        busy={annSave.isPending}
        onSubmit={(input) => annSave.mutate(input)}
        onCancel={() => {
          setAnnFormOpen(false)
          setEditingAnn(null)
        }}
      />

      <ConfirmDialog
        open={deletingAnn !== null}
        title={t('anniversaries.title')}
        description={`「${deletingAnn?.title ?? ''}」${t('common.confirmDeleteNoUndo')}`}
        confirmLabel={t('common.delete')}
        danger
        busy={annDelete.isPending}
        onConfirm={() => deletingAnn && annDelete.mutate(deletingAnn.id)}
        onCancel={() => setDeletingAnn(null)}
      />
    </>
  )
}
