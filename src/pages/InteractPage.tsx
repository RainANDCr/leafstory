/**
 * 互动页（阶段 3 完整版）：
 * - 落叶心愿瓶：创建/编辑/状态推进（想做→计划中→完成→归档）、筛选、
 *   绑定日记、落叶落地动效；
 * - 时光邮局：写信（预览→封存）、信箱（封套列表）、到期开启阅读、
 *   撤回/删除；未到期时收件人无法读到内容（服务端门禁）；
 * - 默契小问答：阶段 4 预告。
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
import { LeafIcon, MailIcon } from '@/components/layout/icons'
import { WishFormDialog } from '@/features/wishes/WishFormDialog'
import { WishLinkDialog } from '@/features/wishes/WishLinkDialog'
import { FallingLeafToast } from '@/features/wishes/FallingLeafToast'
import { LetterComposeDialog } from '@/features/letters/LetterComposeDialog'
import { LetterReadDialog } from '@/features/letters/LetterReadDialog'
import { QuizPanel } from '@/features/quiz/QuizPanel'
import { formatUnlockTime, isUnlocked, remainingText } from '@/features/letters/time'
import { useAuth } from '@/features/auth/AuthContext'
import { useCoupleSnapshot, partnerOf } from '@/features/couple/useCoupleSnapshot'
import {
  createWish,
  deleteWish,
  linkWishDiary,
  listWishes,
  setWishStatus,
  updateWish,
  type Wish,
  type WishInput,
  type WishStatus,
} from '@/services/wishService'
import {
  deleteLetter,
  listLetters,
  readLetter,
  revokeLetter,
  sealLetter,
  type LetterContent,
} from '@/services/letterService'
import { listSharedDiariesForTree } from '@/services/diaryService'
import { formatDateHuman } from '@/lib/dates'
import { getErrorMessage } from '@/lib/errors'
import { t, zhCN } from '@/i18n'

type Tab = 'wishes' | 'letters' | 'quiz'
type WishFilter = 'all' | 'open' | 'done'

const STATUS_LABEL: Record<WishStatus, string> = {
  wish: zhCN.wishes.statusWish,
  planned: zhCN.wishes.statusPlanned,
  done: zhCN.wishes.statusDone,
  archived: zhCN.wishes.statusArchived,
}

const PRIORITY_COLOR: Record<string, string> = {
  high: '#B96F57',
  normal: '#C99D4A',
  low: '#75816B',
}

export function InteractPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { userId } = useAuth()
  const coupleQuery = useCoupleSnapshot()
  const couple = coupleQuery.data?.info ?? null
  const coupleId = couple?.coupleId ?? null
  const partner = partnerOf(couple, userId)

  const [tab, setTab] = useState<Tab>('wishes')

  // ---- 心愿状态 ----
  const [wishFilter, setWishFilter] = useState<WishFilter>('all')
  const [wishFormOpen, setWishFormOpen] = useState(false)
  const [editingWish, setEditingWish] = useState<Wish | null>(null)
  const [linkingWish, setLinkingWish] = useState<Wish | null>(null)
  const [deletingWish, setDeletingWish] = useState<Wish | null>(null)
  const [leafFallKey, setLeafFallKey] = useState(0)

  // ---- 信件状态 ----
  const [composeOpen, setComposeOpen] = useState(false)
  const [readingLetter, setReadingLetter] = useState<LetterContent | null>(null)
  const [readError, setReadError] = useState('')
  const [revokingLetter, setRevokingLetter] = useState<{ id: string } | null>(null)
  const [deletingLetter, setDeletingLetter] = useState<{ id: string } | null>(null)
  const [actionError, setActionError] = useState('')

  const wishesQuery = useQuery({
    queryKey: ['wishes', coupleId],
    queryFn: () => listWishes(coupleId!),
    enabled: Boolean(coupleId),
  })

  const lettersQuery = useQuery({
    queryKey: ['letters', coupleId],
    queryFn: () => listLetters(coupleId!),
    enabled: Boolean(coupleId),
  })

  /** 绑定日记的候选：双方可见的已发布日记 */
  const sharedDiariesQuery = useQuery({
    queryKey: ['sharedDiaries', coupleId],
    queryFn: () => listSharedDiariesForTree(100),
    enabled: Boolean(coupleId),
    staleTime: 60_000,
  })

  const invalidateWishes = () => {
    void qc.invalidateQueries({ queryKey: ['wishes'] })
    void qc.invalidateQueries({ queryKey: ['sharedDiaries'] })
  }
  const invalidateLetters = () => void qc.invalidateQueries({ queryKey: ['letters'] })

  const wishSave = useMutation({
    mutationFn: async (input: WishInput) => {
      if (!coupleId || !userId) throw new Error('未配对')
      if (editingWish) await updateWish(editingWish.id, input)
      else await createWish(coupleId, userId, input)
    },
    onSuccess: () => {
      setWishFormOpen(false)
      setEditingWish(null)
      setActionError('')
      invalidateWishes()
    },
    onError: (err) => setActionError(getErrorMessage(err)),
  })

  const wishStatus = useMutation({
    mutationFn: ({ id, to }: { id: string; to: WishStatus }) => setWishStatus(id, to),
    onSuccess: (_data, vars) => {
      if (vars.to === 'done') setLeafFallKey((k) => k + 1)
      invalidateWishes()
    },
    onError: (err) => setActionError(getErrorMessage(err)),
  })

  const wishLink = useMutation({
    mutationFn: ({ wishId, diaryId }: { wishId: string; diaryId: string | null }) =>
      linkWishDiary(wishId, diaryId, userId ?? ''),
    onSuccess: () => {
      setLinkingWish(null)
      invalidateWishes()
    },
    onError: (err) => setActionError(getErrorMessage(err)),
  })

  const wishDelete = useMutation({
    mutationFn: (id: string) => deleteWish(id),
    onSuccess: () => {
      setDeletingWish(null)
      invalidateWishes()
    },
    onError: (err) => {
      setActionError(getErrorMessage(err))
      setDeletingWish(null)
    },
  })

  const letterSeal = useMutation({
    mutationFn: (input: Parameters<typeof sealLetter>[2]) => {
      if (!coupleId || !userId) throw new Error('未配对')
      return sealLetter(coupleId, userId, input)
    },
    onSuccess: () => {
      setComposeOpen(false)
      setActionError('')
      invalidateLetters()
    },
    onError: (err) => setActionError(getErrorMessage(err)),
  })

  const letterOpen = useMutation({
    mutationFn: (id: string) => readLetter(id),
    onSuccess: (letter) => {
      setReadError('')
      setReadingLetter(letter)
    },
    onError: (err) => setReadError(getErrorMessage(err)),
  })

  const letterRevoke = useMutation({
    mutationFn: (id: string) => revokeLetter(id),
    onSuccess: () => {
      setRevokingLetter(null)
      invalidateLetters()
    },
    onError: (err) => {
      setActionError(getErrorMessage(err))
      setRevokingLetter(null)
    },
  })

  const letterDelete = useMutation({
    mutationFn: (id: string) => deleteLetter(id),
    onSuccess: () => {
      setDeletingLetter(null)
      invalidateLetters()
    },
    onError: (err) => {
      setActionError(getErrorMessage(err))
      setDeletingLetter(null)
    },
  })

  if (coupleQuery.isLoading) return <LoadingState />
  if (coupleQuery.isError) {
    return <ErrorState message={getErrorMessage(coupleQuery.error)} onRetry={() => void qc.invalidateQueries({ queryKey: ['couple'] })} />
  }
  if (!couple) {
    return (
      <>
        <PageHeader title={t('interact.title')} description={t('interact.intro')} />
        <EmptyState
          icon={<LeafIcon className="h-6 w-6" />}
          title={t('forest.needPairing')}
          description={t('forest.needPairingDesc')}
          action={<Button onClick={() => navigate('/pairing')}>{t('forest.goPairing')}</Button>}
        />
      </>
    )
  }

  const allWishes = wishesQuery.data ?? []
  const filteredWishes = allWishes.filter((w) =>
    wishFilter === 'all'
      ? true
      : wishFilter === 'open'
        ? w.status === 'wish' || w.status === 'planned'
        : w.status === 'done' || w.status === 'archived',
  )

  const letters = lettersQuery.data ?? []
  const authorName = (authorId: string) =>
    authorId === userId ? (couple!.members.find((m) => m.userId === userId)?.nickname ?? '我') : (partner?.nickname ?? 'TA')
  const anyArrived = letters.some((l) => l.status === 'sealed' && l.authorId !== userId && isUnlocked(l.unlockAt))
  const sharedDiaries = sharedDiariesQuery.data ?? []

  return (
    <>
      <PageHeader
        title={t('interact.title')}
        description={t('interact.intro')}
        actions={
          tab === 'wishes' ? (
            <Button
              variant="secondary"
              onClick={() => {
                setEditingWish(null)
                setWishFormOpen(true)
              }}
            >
              {t('wishes.newWish')}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setComposeOpen(true)}>
              {t('letters.write')}
            </Button>
          )
        }
      />

      {/* 标签切换 */}
      <div className="mb-4 flex w-fit max-w-full flex-wrap rounded-2xl bg-paper-deep p-1 text-sm" role="tablist">
        {(
          [
            ['wishes', t('interact.tabWishes')],
            ['letters', t('interact.tabLetters')],
            ['quiz', t('quiz.title')],
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

      {tab === 'wishes' ? (
        <>
          {/* 筛选 */}
          <div className="mb-4 flex gap-2">
            {(
              [
                ['all', t('wishes.filterAll')],
                ['open', t('wishes.filterOpen')],
                ['done', t('wishes.filterDone')],
              ] as ReadonlyArray<readonly [WishFilter, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={wishFilter === value}
                onClick={() => setWishFilter(value)}
                className={`min-h-9 rounded-full border px-3.5 text-xs transition-colors ${
                  wishFilter === value ? 'border-bark bg-bark text-paper' : 'border-paper-edge bg-card text-bark-soft hover:text-bark'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {wishesQuery.isLoading ? (
            <LoadingState />
          ) : wishesQuery.isError ? (
            <ErrorState message={getErrorMessage(wishesQuery.error)} onRetry={() => void wishesQuery.refetch()} />
          ) : filteredWishes.length === 0 ? (
            <EmptyState
              icon={<LeafIcon className="h-6 w-6" />}
              title={allWishes.length === 0 ? t('wishes.emptyTitle') : t('wishes.filterDone')}
              description={allWishes.length === 0 ? t('wishes.emptyDesc') : undefined}
              action={
                allWishes.length === 0 ? (
                  <Button onClick={() => setWishFormOpen(true)}>{t('wishes.newWish')}</Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="space-y-3">
              {filteredWishes.map((wish) => (
                <li key={wish.id}>
                  <Card className="!p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: PRIORITY_COLOR[wish.priority] }} />
                          <h3 className={`font-display text-base ${wish.status === 'done' ? 'text-bark-soft line-through' : 'text-bark'}`}>
                            {wish.title}
                          </h3>
                          <span className="rounded-full border border-paper-edge bg-paper-deep px-2 py-0.5 text-[11px] text-bark-soft">
                            {STATUS_LABEL[wish.status]}
                          </span>
                        </div>
                        {wish.description ? <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-bark-soft">{wish.description}</p> : null}
                        <p className="mt-1.5 text-xs text-bark-soft">
                          {authorName(wish.createdBy)} 许的愿
                          {wish.dueDate ? ` · ${t('wishes.dueLabel')} ${formatDateHuman(wish.dueDate)}` : ''}
                          {wish.placeNote ? ` · ${wish.placeNote}` : ''}
                        </p>
                        {wish.linkedDiaryId ? (
                          <Link to={`/diary/${wish.linkedDiaryId}`} className="mt-1 inline-block text-xs text-leaf-gold underline underline-offset-2">
                            🍂 {t('wishes.linkDiary')} →
                          </Link>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5 text-xs">
                        {wish.status !== 'done' && wish.status !== 'archived' ? (
                          <>
                            {wish.status === 'wish' ? (
                              <button
                                type="button"
                                className="rounded-lg border border-paper-edge bg-card px-2.5 py-1.5 hover:bg-paper-deep"
                                onClick={() => wishStatus.mutate({ id: wish.id, to: 'planned' })}
                              >
                                {t('wishes.moveToPlanned')}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="rounded-lg bg-leaf-gold/25 px-2.5 py-1.5 font-medium text-bark hover:bg-leaf-gold/40"
                              onClick={() => wishStatus.mutate({ id: wish.id, to: 'done' })}
                            >
                              {t('wishes.markDone')}
                            </button>
                          </>
                        ) : wish.status === 'done' ? (
                          <button type="button" className="text-bark-soft underline underline-offset-2" onClick={() => wishStatus.mutate({ id: wish.id, to: 'archived' })}>
                            {t('wishes.archive')}
                          </button>
                        ) : null}
                        <div className="flex gap-2">
                          <button type="button" className="text-bark-soft underline underline-offset-2 hover:text-bark" onClick={() => setLinkingWish(wish)}>
                            {wish.linkedDiaryId ? t('wishes.changeLink') : t('wishes.linkDiary')}
                          </button>
                          <button
                            type="button"
                            className="text-bark-soft underline underline-offset-2 hover:text-bark"
                            onClick={() => {
                              setEditingWish(wish)
                              setWishFormOpen(true)
                            }}
                          >
                            {t('common.edit')}
                          </button>
                          <button type="button" className="text-maple underline underline-offset-2" onClick={() => setDeletingWish(wish)}>
                            {t('common.delete')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : tab === 'letters' ? (
        <>
          {anyArrived ? (
            <p role="status" className="mb-4 rounded-2xl border border-leaf-gold/50 bg-leaf-gold/10 px-4 py-2.5 text-sm text-bark">
              ✦ {t('letters.arrivedHint')}
            </p>
          ) : null}

          {lettersQuery.isLoading ? (
            <LoadingState />
          ) : lettersQuery.isError ? (
            <ErrorState message={getErrorMessage(lettersQuery.error)} onRetry={() => void lettersQuery.refetch()} />
          ) : letters.length === 0 ? (
            <EmptyState
              icon={<MailIcon className="h-6 w-6" />}
              title={t('letters.title')}
              description={t('letters.intro')}
              action={<Button onClick={() => setComposeOpen(true)}>{t('letters.write')}</Button>}
            />
          ) : (
            <ul className="space-y-3">
              {letters.map((letter) => {
                const mine = letter.authorId === userId
                const unlocked = isUnlocked(letter.unlockAt)
                const remaining = remainingText(letter.unlockAt)
                return (
                  <li key={letter.id}>
                    <Card className="flex items-center justify-between gap-3 !p-4">
                      <div className="flex min-w-0 items-center gap-3.5">
                        <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-paper-deep text-forest">
                          <MailIcon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm text-bark">
                            {zhCN.letters.fromWho(authorName(letter.authorId))}
                            {letter.recipient === 'both' ? ` · ${zhCN.letters.toBoth}` : ''}
                            {mine ? ` · ${zhCN.letters.myLetter}` : ''}
                          </p>
                          <p className="mt-0.5 text-xs text-bark-soft">
                            {zhCN.letters.unlockAtLabel}：{formatUnlockTime(letter.unlockAt)}
                            {letter.status === 'sealed' && !unlocked && remaining ? ` · ${zhCN.letters.remaining(remaining)}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] ${
                            letter.status === 'revoked'
                              ? 'bg-paper-deep text-bark-soft'
                              : letter.status === 'sealed' && !unlocked
                                ? 'bg-paper-deep text-bark-soft'
                                : 'bg-leaf-gold/20 font-medium text-bark'
                          }`}
                        >
                          {letter.status === 'revoked' ? t('letters.statusRevoked') : unlocked ? t('letters.statusUnlocked') : t('letters.statusSealed')}
                        </span>
                        <div className="flex gap-2 text-xs">
                          {(mine || (letter.status === 'sealed' && unlocked)) ? (
                            <button
                              type="button"
                              className="rounded-lg bg-bark px-2.5 py-1.5 font-medium text-paper hover:bg-bark-deep"
                              onClick={() => letterOpen.mutate(letter.id)}
                            >
                              {mine ? t('letters.readOwn') : t('letters.openAction')}
                            </button>
                          ) : null}
                          {mine && letter.status === 'sealed' && !unlocked ? (
                            <button type="button" className="text-bark-soft underline underline-offset-2" onClick={() => setRevokingLetter({ id: letter.id })}>
                              {t('letters.revoke')}
                            </button>
                          ) : null}
                          {mine ? (
                            <button type="button" className="text-maple underline underline-offset-2" onClick={() => setDeletingLetter({ id: letter.id })}>
                              {t('common.delete')}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </Card>
                  </li>
                )
              })}
            </ul>
          )}
          {readError ? (
            <p role="alert" className="mt-4 rounded-2xl border border-maple/40 bg-maple/5 p-3 text-sm text-maple">
              {readError}
            </p>
          ) : null}
          <p className="mt-4 text-xs leading-5 text-bark-soft">{t('letters.sealHint')}</p>
        </>
      ) : (
        <QuizPanel />
      )}

      {/* 对话框们 */}
      <WishFormDialog
        open={wishFormOpen}
        initial={editingWish}
        busy={wishSave.isPending}
        onSubmit={(input) => wishSave.mutate(input)}
        onCancel={() => {
          setWishFormOpen(false)
          setEditingWish(null)
        }}
      />

      <WishLinkDialog
        open={linkingWish !== null}
        entries={sharedDiaries}
        busy={wishLink.isPending}
        onSubmit={(diaryId) => linkingWish && wishLink.mutate({ wishId: linkingWish.id, diaryId })}
        onCancel={() => setLinkingWish(null)}
      />

      <ConfirmDialog
        open={deletingWish !== null}
        title={t('common.confirmDeleteTitle')}
        description={`「${deletingWish?.title ?? ''}」${t('common.confirmDeleteNoUndo')}`}
        confirmLabel={t('common.delete')}
        danger
        busy={wishDelete.isPending}
        onConfirm={() => deletingWish && wishDelete.mutate(deletingWish.id)}
        onCancel={() => setDeletingWish(null)}
      />

      <LetterComposeDialog
        open={composeOpen}
        busy={letterSeal.isPending}
        onSubmit={(input) => letterSeal.mutate(input)}
        onCancel={() => setComposeOpen(false)}
      />

      <LetterReadDialog
        open={readingLetter !== null}
        letter={readingLetter}
        authorName={readingLetter ? authorName(readingLetter.authorId) : ''}
        onClose={() => setReadingLetter(null)}
      />

      <ConfirmDialog
        open={revokingLetter !== null}
        title={t('letters.revokeConfirmTitle')}
        description={t('letters.revokeConfirmDesc')}
        confirmLabel={t('letters.revoke')}
        danger
        busy={letterRevoke.isPending}
        onConfirm={() => revokingLetter && letterRevoke.mutate(revokingLetter.id)}
        onCancel={() => setRevokingLetter(null)}
      />

      <ConfirmDialog
        open={deletingLetter !== null}
        title={t('letters.deleteConfirmTitle')}
        description={t('letters.deleteConfirmDesc')}
        confirmLabel={t('common.delete')}
        danger
        busy={letterDelete.isPending}
        onConfirm={() => deletingLetter && letterDelete.mutate(deletingLetter.id)}
        onCancel={() => setDeletingLetter(null)}
      />

      {/* 愿望完成：落叶落地动效（key 驱动重复播放） */}
      {leafFallKey > 0 ? <FallingLeafToast key={leafFallKey} /> : null}
    </>
  )
}
