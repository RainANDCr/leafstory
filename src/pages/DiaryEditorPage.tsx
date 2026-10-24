/**
 * 日记编辑器：新建（/diary/new）与编辑（/diary/:id/edit）。
 * 表单状态在挂载时初始化（经 key 重挂载），避免 effect 同步；
 * 可见范围默认「双方可见」，草稿与私密日记仅作者可见；
 * 照片上限 9 张、单张 10MB、上传前压缩，失败不谎报成功。
 */
import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { LoadingState } from '@/components/feedback/LoadingState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { MoodPicker } from '@/features/diary/components/MoodPicker'
import { MediaUploader, type ExistingMediaView } from '@/features/diary/components/MediaUploader'
import { useAuth } from '@/features/auth/AuthContext'
import { useCoupleSnapshot } from '@/features/couple/useCoupleSnapshot'
import { validateDiaryForm, type DiaryMedia, type DiaryStatus, type Mood, type Visibility } from '@/features/diary/types'
import {
  createDiary,
  getDiaryDetail,
  removeDiaryMedia,
  updateDiary,
  uploadDiaryMedia,
  type DiaryDetail,
} from '@/services/diaryService'
import { MAX_IMAGE_BYTES, MAX_MEDIA_PER_ENTRY, isImageFile } from '@/lib/image'
import { toISODate } from '@/lib/dates'
import { t, zhCN } from '@/i18n'

export function DiaryEditorPage() {
  const { id } = useParams()
  const { userId } = useAuth()
  const coupleQuery = useCoupleSnapshot()
  const isEdit = Boolean(id)

  const detailQuery = useQuery({
    queryKey: ['diary', id],
    queryFn: () => getDiaryDetail(id as string),
    enabled: isEdit,
  })

  if (coupleQuery.isLoading) return <LoadingState />

  const coupleInfo = coupleQuery.data?.info
  if (!coupleInfo) {
    return (
      <>
        <PageHeader title={isEdit ? t('diary.editorEditTitle') : t('diary.editorNewTitle')} />
        <EmptyState
          title={t('forest.needPairing')}
          description={t('forest.needPairingDesc')}
          action={
            <Link to="/pairing" className="inline-flex min-h-11 items-center rounded-2xl bg-bark px-4 text-sm font-medium text-paper">
              {t('forest.goPairing')}
            </Link>
          }
        />
      </>
    )
  }

  if (isEdit && detailQuery.isLoading) return <LoadingState />
  if (isEdit && (detailQuery.isError || detailQuery.data?.entry.authorId !== userId)) {
    return <ErrorState message={t('diary.errors.notFound')} />
  }

  return (
    <DiaryForm
      key={id ?? 'new'}
      entryId={id ?? null}
      initial={isEdit ? (detailQuery.data as DiaryDetail) : null}
      coupleId={coupleInfo.coupleId}
      userId={userId as string}
    />
  )
}

interface DiaryFormProps {
  entryId: string | null
  initial: DiaryDetail | null
  coupleId: string
  userId: string
}

function DiaryForm({ entryId, initial, coupleId, userId }: DiaryFormProps) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isEdit = Boolean(entryId)

  const [title, setTitle] = useState(initial?.entry.title ?? '')
  const [content, setContent] = useState(initial?.entry.content ?? '')
  const [happenedOn, setHappenedOn] = useState(initial?.entry.happenedOn ?? toISODate())
  const [mood, setMood] = useState<Mood>((initial?.entry.mood as Mood) ?? 'joy')
  const [category, setCategory] = useState(initial?.entry.category ?? '')
  const [visibility, setVisibility] = useState<Visibility>(initial?.entry.visibility ?? 'shared')

  const [existingMedia, setExistingMedia] = useState<Array<ExistingMediaView & { raw: DiaryMedia }>>(
    () => initial?.media.map((m, i) => ({ id: m.id, url: initial.mediaUrls[i] ?? '', fileName: m.fileName, raw: m })) ?? [],
  )
  const [pendingRemovals, setPendingRemovals] = useState<DiaryMedia[]>([])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [mediaNotice, setMediaNotice] = useState('')

  const [errors, setErrors] = useState<ReturnType<typeof validateDiaryForm>>({})
  const [error, setError] = useState('')
  const [savedId, setSavedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const totalPhotos = existingMedia.length + newFiles.length
  const busyText = useMemo(() => (newFiles.length > 0 ? t('diary.mediaUploading') : t('common.saving')), [newFiles.length])

  function addFiles(files: File[]) {
    setMediaNotice('')
    const accepted: File[] = []
    for (const file of files) {
      if (!isImageFile(file)) {
        setMediaNotice(t('diary.mediaNotImage'))
        continue
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setMediaNotice(zhCN.diary.mediaTooLarge(file.name))
        continue
      }
      accepted.push(file)
    }
    const room = MAX_MEDIA_PER_ENTRY - totalPhotos
    const take = accepted.slice(0, Math.max(0, room))
    if (accepted.length > take.length) setMediaNotice(t('diary.mediaTooMany'))
    if (take.length === 0) return
    setNewFiles((prev) => [...prev, ...take])
    setPreviews((prev) => [...prev, ...take.map((f) => URL.createObjectURL(f))])
  }

  function removeNew(index: number) {
    URL.revokeObjectURL(previews[index]!)
    setNewFiles((prev) => prev.filter((_, i) => i !== index))
    setPreviews((prev) => prev.filter((_, i) => i !== index))
  }

  function removeExisting(mediaId: string) {
    const target = existingMedia.find((m) => m.id === mediaId)
    if (!target) return
    setExistingMedia((prev) => prev.filter((m) => m.id !== mediaId))
    setPendingRemovals((prev) => [...prev, target.raw])
  }

  async function submit(status: DiaryStatus) {
    const nextErrors = validateDiaryForm({ title, content, happenedOn })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setBusy(true)
    setError('')
    try {
      let targetId = entryId
      if (isEdit && targetId) {
        await updateDiary(targetId, {
          title: title.trim(),
          content,
          happenedOn,
          mood,
          category: category.trim() || null,
          visibility,
          status,
        })
      } else {
        targetId = await createDiary({
          coupleId,
          title,
          content,
          happenedOn,
          mood,
          category: category.trim() || null,
          visibility,
          status,
        })
      }

      for (const media of pendingRemovals) {
        await removeDiaryMedia(media)
      }

      let failed: string[] = []
      if (newFiles.length > 0 && targetId) {
        failed = await uploadDiaryMedia(userId, coupleId, targetId, newFiles, existingMedia.length)
      }

      void qc.invalidateQueries({ queryKey: ['diaries'] })
      void qc.invalidateQueries({ queryKey: ['diary', targetId] })
      void qc.invalidateQueries({ queryKey: ['sharedDiaries'] })

      if (failed.length > 0) {
        setSavedId(targetId)
        setError(zhCN.diary.errors.uploadFailed(failed.join('、')))
      } else if (targetId) {
        navigate(`/diary/${targetId}`, { replace: true })
      }
    } catch {
      setError(t('diary.errors.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'mt-1 w-full min-h-11 rounded-2xl border border-paper-edge bg-paper px-3.5 py-2 text-sm text-bark placeholder:text-bark-soft/60'
  const labelCls = 'block text-sm font-medium text-bark'

  return (
    <>
      <PageHeader
        title={isEdit ? t('diary.editorEditTitle') : t('diary.editorNewTitle')}
        actions={
          <Link
            to={isEdit ? `/diary/${entryId}` : '/diary'}
            className="inline-flex min-h-11 items-center rounded-2xl px-3 text-sm text-bark-soft hover:text-bark"
          >
            {t('common.cancel')}
          </Link>
        }
      />

      <form
        className="space-y-5"
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          void submit('published')
        }}
      >
        <div>
          <label className={labelCls} htmlFor="diary-title">
            {t('diary.fieldTitle')}
          </label>
          <input
            id="diary-title"
            className={inputCls}
            placeholder={t('diary.fieldTitlePlaceholder')}
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          {errors.title ? <p className="mt-1 text-xs text-maple">{errors.title}</p> : null}
        </div>

        <div>
          <label className={labelCls} htmlFor="diary-content">
            {t('diary.fieldContent')}
          </label>
          <textarea
            id="diary-content"
            className={`${inputCls} min-h-44 leading-7`}
            placeholder={t('diary.fieldContentPlaceholder')}
            maxLength={20000}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          {errors.content ? <p className="mt-1 text-xs text-maple">{errors.content}</p> : null}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="diary-date">
              {t('diary.fieldDate')}
            </label>
            <input
              id="diary-date"
              type="date"
              className={inputCls}
              value={happenedOn}
              onChange={(e) => setHappenedOn(e.target.value)}
            />
            {errors.happenedOn ? <p className="mt-1 text-xs text-maple">{errors.happenedOn}</p> : null}
          </div>
          <div>
            <label className={labelCls} htmlFor="diary-category">
              {t('diary.fieldCategory')}
            </label>
            <input
              id="diary-category"
              className={inputCls}
              placeholder={t('diary.fieldCategoryPlaceholder')}
              maxLength={30}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
        </div>

        <div>
          <p className={labelCls}>{t('diary.fieldMood')}</p>
          <p className="mb-2 mt-0.5 text-xs text-bark-soft">{t('diary.fieldMoodHint')}</p>
          <MoodPicker value={mood} onChange={setMood} />
        </div>

        {/* 可见范围 */}
        <fieldset>
          <legend className={labelCls}>{t('diary.fieldVisibility')}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(
              [
                ['shared', t('diary.visibilityShared'), t('diary.visibilitySharedDesc')],
                ['private', t('diary.visibilityPrivate'), t('diary.visibilityPrivateDesc')],
              ] as ReadonlyArray<readonly [Visibility, string, string]>
            ).map(([value, label, desc]) => (
              <button
                key={value}
                type="button"
                aria-pressed={visibility === value}
                onClick={() => setVisibility(value)}
                className={`rounded-2xl border p-3.5 text-left transition-colors ${
                  visibility === value ? 'border-bark bg-bark/5' : 'border-paper-edge bg-card hover:bg-paper-deep/50'
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-bark">
                  <span
                    aria-hidden="true"
                    className={`h-3.5 w-3.5 rounded-full border ${visibility === value ? 'border-bark bg-bark' : 'border-bark-soft'}`}
                  />
                  {label}
                </span>
                <span className="mt-1 block text-xs leading-5 text-bark-soft">{desc}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {/* 照片 */}
        <div>
          <p className={labelCls}>{t('diary.mediaLabel')}</p>
          <div className="mt-2">
            <MediaUploader
              newFiles={newFiles}
              previews={previews}
              onAdd={addFiles}
              onRemoveNew={removeNew}
              existingMedia={existingMedia}
              onRemoveExisting={removeExisting}
              disabled={busy}
            />
          </div>
          {mediaNotice ? <p className="mt-2 text-xs text-maple">{mediaNotice}</p> : null}
        </div>

        {error ? (
          <p role="alert" className="rounded-2xl border border-maple/40 bg-maple/5 p-3 text-sm text-maple">
            {error}
            {savedId ? (
              <>
                {' '}
                <Link to={`/diary/${savedId}`} className="underline underline-offset-2">
                  {t('diary.detailBack')}
                </Link>
              </>
            ) : null}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? busyText : t('diary.publish')}
          </Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void submit('draft')}>
            {busy ? busyText : t('diary.saveDraft')}
          </Button>
        </div>
      </form>
    </>
  )
}
