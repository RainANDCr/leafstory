/**
 * 地点表单：名称、城市级地区、日期、备注、可选坐标（手动或逐次授权定位）、
 * 特殊地点标记、关联日记。定位必须先经过明确的一次性授权说明。
 */
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { getMood, type DiaryEntry } from '@/features/diary/types'
import { formatDateShort } from '@/lib/dates'
import { zhCN } from '@/i18n'
import type { Place, PlaceInput } from '@/services/placeService'

interface PlaceFormDialogProps {
  open: boolean
  initial?: Place | null
  entries: readonly DiaryEntry[]
  busy?: boolean
  onSubmit: (input: PlaceInput) => void
  onCancel: () => void
}

export function PlaceFormDialog({ open, initial, entries, busy, onSubmit, onCancel }: PlaceFormDialogProps) {
  if (!open) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={initial ? zhCN.footprints.editPlace : zhCN.footprints.addPlace}
      className="fixed inset-0 z-50 flex items-end justify-center bg-bark-deep/40 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <PlaceForm key={initial?.id ?? 'new'} initial={initial} entries={entries} busy={busy} onSubmit={onSubmit} onCancel={onCancel} />
    </div>
  )
}

function PlaceForm({ initial, entries, busy, onSubmit, onCancel }: Omit<PlaceFormDialogProps, 'open'> & { initial?: Place | null }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [region, setRegion] = useState(initial?.region ?? '')
  const [happenedOn, setHappenedOn] = useState(initial?.happenedOn ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [lat, setLat] = useState(initial?.latitude !== null && initial?.latitude !== undefined ? String(initial.latitude) : '')
  const [lng, setLng] = useState(initial?.longitude !== null && initial?.longitude !== undefined ? String(initial.longitude) : '')
  const [isSpecial, setIsSpecial] = useState(initial?.isSpecial ?? false)
  const [specialLabel, setSpecialLabel] = useState(initial?.specialLabel ?? '')
  const [diaryIds, setDiaryIds] = useState<string[]>(initial?.linkedDiaries.map((d) => d.id) ?? [])
  const [consentOpen, setConsentOpen] = useState(false)
  const [locationNotice, setLocationNotice] = useState('')
  const [errors, setErrors] = useState<{ name?: string; coords?: string }>({})

  function requestLocation() {
    setLocationNotice('')
    if (!('geolocation' in navigator)) {
      setLocationNotice(zhCN.footprints.locationFailed)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6))
        setLng(pos.coords.longitude.toFixed(6))
        setConsentOpen(false)
      },
      (err) => {
        setConsentOpen(false)
        setLocationNotice(err.code === err.PERMISSION_DENIED ? zhCN.footprints.locationDenied : zhCN.footprints.locationFailed)
      },
      { timeout: 10_000, maximumAge: 0 },
    )
  }

  function submit() {
    const next: typeof errors = {}
    if (name.trim().length === 0) next.name = zhCN.footprints.errors.nameRequired
    const latNum = lat.trim() === '' ? null : Number(lat)
    const lngNum = lng.trim() === '' ? null : Number(lng)
    const coordsBad =
      (latNum !== null && (Number.isNaN(latNum) || latNum < -90 || latNum > 90)) ||
      (lngNum !== null && (Number.isNaN(lngNum) || lngNum < -180 || lngNum > 180)) ||
      (latNum === null) !== (lngNum === null) // 只填一边也不行
    if (coordsBad) next.coords = zhCN.footprints.errors.coordsInvalid
    setErrors(next)
    if (Object.keys(next).length > 0) return

    onSubmit({
      name,
      region: region.trim() || null,
      note: note.trim() || null,
      happenedOn: happenedOn || null,
      latitude: latNum,
      longitude: lngNum,
      isSpecial,
      specialLabel: isSpecial ? specialLabel : null,
      diaryIds,
    })
  }

  const labelCls = 'block text-sm font-medium text-bark'
  const inputCls =
    'mt-1 w-full min-h-11 rounded-2xl border border-paper-edge bg-paper px-3.5 py-2 text-sm text-bark placeholder:text-bark-soft/60'

  return (
    <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-card border border-paper-edge bg-card p-5 shadow-lift sm:rounded-card">
      <h2 className="font-display text-lg text-bark">{initial ? zhCN.footprints.editPlace : zhCN.footprints.addPlace}</h2>

      <div className="mt-4 space-y-4">
        <div>
          <label className={labelCls} htmlFor="place-name">
            {zhCN.footprints.fieldName}
          </label>
          <input
            id="place-name"
            className={inputCls}
            maxLength={60}
            placeholder={zhCN.footprints.namePlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {errors.name ? <p className="mt-1 text-xs text-maple">{errors.name}</p> : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="place-region">
              {zhCN.footprints.fieldRegion}
            </label>
            <input
              id="place-region"
              className={inputCls}
              maxLength={60}
              placeholder={zhCN.footprints.regionPlaceholder}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="place-date">
              {zhCN.footprints.fieldDate}
            </label>
            <input id="place-date" type="date" className={inputCls} value={happenedOn} onChange={(e) => setHappenedOn(e.target.value)} />
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="place-note">
            {zhCN.footprints.fieldNote}
          </label>
          <textarea
            id="place-note"
            className={`${inputCls} min-h-20`}
            maxLength={500}
            placeholder={zhCN.footprints.notePlaceholder}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {/* 坐标：可选，绝不自动采集 */}
        <fieldset>
          <legend className={labelCls}>{zhCN.footprints.fieldCoords}</legend>
          <p className="mt-0.5 text-xs text-bark-soft">{zhCN.footprints.coordsHint}</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <div className="min-w-28 flex-1">
              <label className="text-xs text-bark-soft" htmlFor="place-lat">
                {zhCN.footprints.latLabel}
              </label>
              <input id="place-lat" inputMode="decimal" className={inputCls} value={lat} onChange={(e) => setLat(e.target.value)} />
            </div>
            <div className="min-w-28 flex-1">
              <label className="text-xs text-bark-soft" htmlFor="place-lng">
                {zhCN.footprints.lngLabel}
              </label>
              <input id="place-lng" inputMode="decimal" className={inputCls} value={lng} onChange={(e) => setLng(e.target.value)} />
            </div>
            <Button type="button" variant="secondary" onClick={() => setConsentOpen(true)}>
              {zhCN.footprints.useLocation}
            </Button>
          </div>
          {errors.coords ? <p className="mt-1 text-xs text-maple">{errors.coords}</p> : null}
          {locationNotice ? <p className="mt-1 text-xs text-bark-soft">{locationNotice}</p> : null}
        </fieldset>

        <div className="space-y-2">
          <label className="flex items-center gap-3">
            <input
              id="place-special"
              type="checkbox"
              className="h-4.5 w-4.5 accent-bark"
              checked={isSpecial}
              onChange={(e) => setIsSpecial(e.target.checked)}
            />
            <span className="text-sm text-bark">{zhCN.footprints.fieldSpecial}</span>
          </label>
          {isSpecial ? (
            <input
              aria-label={zhCN.footprints.specialLabelField}
              className={inputCls}
              maxLength={20}
              placeholder={zhCN.footprints.specialLabelPlaceholder}
              value={specialLabel}
              onChange={(e) => setSpecialLabel(e.target.value)}
            />
          ) : null}
        </div>

        <div>
          <p className={labelCls}>{zhCN.footprints.fieldDiaries}</p>
          {entries.length === 0 ? (
            <p className="mt-2 rounded-2xl bg-paper-deep p-3 text-xs text-bark-soft">{zhCN.wishes.noDiaries}</p>
          ) : (
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {entries.map((e) => (
                <li key={e.id}>
                  <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1 text-sm text-bark hover:bg-paper-deep">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-bark"
                      checked={diaryIds.includes(e.id)}
                      onChange={() =>
                        setDiaryIds((prev) => (prev.includes(e.id) ? prev.filter((x) => x !== e.id) : [...prev, e.id]))
                      }
                    />
                    <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getMood(e.mood).color }} />
                    <span className="text-xs text-bark-soft">{formatDateShort(e.happenedOn)}</span>
                    <span className="truncate">{e.title || '无题'}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {zhCN.common.cancel}
        </Button>
        <Button onClick={submit} disabled={busy}>
          {busy ? zhCN.common.saving : zhCN.common.save}
        </Button>
      </div>

      <ConfirmDialog
        open={consentOpen}
        title={zhCN.footprints.locationConsentTitle}
        description={zhCN.footprints.locationConsentBody}
        confirmLabel={zhCN.footprints.useLocation}
        onConfirm={requestLocation}
        onCancel={() => setConsentOpen(false)}
      />
    </div>
  )
}
