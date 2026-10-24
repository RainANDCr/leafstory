/**
 * 默契小问答面板：
 * 抽题（四类题库，可跳过换题）→ 各自作答（草稿仅自己可见）→
 * 双方都提交后揭晓 → 可收藏为日记（用户确认）。
 * 无评分、无默契度判定——只是看见彼此的视角。
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { CATEGORY_LABEL, pickQuestion, questionById, type QuizCategory } from './questionBank'
import { useAuth } from '@/features/auth/AuthContext'
import { useCoupleSnapshot, partnerOf } from '@/features/couple/useCoupleSnapshot'
import {
  endQuizEarly,
  favoriteQuizToDiary,
  listQuizSessions,
  saveQuizAnswer,
  skipQuizSession,
  startQuizSession,
} from '@/services/quizService'
import { createDiary } from '@/services/diaryService'
import { toISODate } from '@/lib/dates'
import { getErrorMessage } from '@/lib/errors'
import { zhCN } from '@/i18n'

const EMOJI_CHOICES = ['😊', '🥰', '😅', '🤔', '✨', '🍂', '❤️', '🌙'] as const

type PickTab = QuizCategory | 'all'

export function QuizPanel() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  const coupleQuery = useCoupleSnapshot()
  const couple = coupleQuery.data?.info ?? null
  const partner = partnerOf(couple, userId)

  const [pickTab, setPickTab] = useState<PickTab>('all')
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [answerText, setAnswerText] = useState('')
  const [answerEmoji, setAnswerEmoji] = useState('')
  const [draftNotice, setDraftNotice] = useState('')
  const [error, setError] = useState('')
  const [favoriteTarget, setFavoriteTarget] = useState<string | null>(null)

  const sessionsQuery = useQuery({
    queryKey: ['quizSessions', couple?.coupleId],
    queryFn: () => listQuizSessions(couple!.coupleId, userId!, partner?.userId ?? null),
    enabled: Boolean(couple?.coupleId && userId),
  })

  const sessions = sessionsQuery.data ?? []
  const usedQuestionIds = sessions.map((s) => s.questionId)
  const activeSession = sessions.find((s) => s.status === 'open') ?? null
  const history = sessions.filter((s) => s.status === 'revealed')

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['quizSessions'] })

  const startMutation = useMutation({
    mutationFn: (questionId: string) => startQuizSession(couple!.coupleId, userId!, questionId),
    onSuccess: () => {
      setAnswerText('')
      setAnswerEmoji('')
      setError('')
      invalidate()
    },
    onError: (err) => setError(getErrorMessage(err)),
  })

  const saveMutation = useMutation({
    mutationFn: (submit: boolean) =>
      saveQuizAnswer(activeSession!.id, { content: answerText, emoji: answerEmoji || null, submit }),
    onSuccess: (_data, submit) => {
      setDraftNotice(submit ? '' : zhCN.quiz.draftSaved)
      invalidate()
    },
    onError: (err) => setError(getErrorMessage(err)),
  })

  const endMutation = useMutation({
    mutationFn: () => endQuizEarly(activeSession!.id, userId!),
    onSuccess: invalidate,
    onError: (err) => setError(getErrorMessage(err)),
  })

  const skipMutation = useMutation({
    mutationFn: () => skipQuizSession(activeSession!.id),
    onSuccess: () => {
      setAnswerText('')
      setAnswerEmoji('')
      invalidate()
    },
    onError: (err) => setError(getErrorMessage(err)),
  })

  const favoriteMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const session = sessions.find((s) => s.id === sessionId)
      if (!session || !couple || !userId) throw new Error('NOT_FOUND')
      const question = questionById(session.questionId)
      const myName = couple.members.find((m) => m.userId === userId)?.nickname ?? '我'
      const partnerName = partner?.nickname ?? 'TA'
      const lines: string[] = [`【问题】${question?.content ?? ''}`, '']
      if (session.myAnswer) {
        lines.push(`${myName}：${session.myAnswer.emoji ?? ''} ${session.myAnswer.content}`.trim(), '')
      }
      if (session.partnerAnswer) {
        lines.push(`${partnerName}：${session.partnerAnswer.emoji ?? ''} ${session.partnerAnswer.content}`.trim())
      }
      const diaryId = await createDiary({
        coupleId: couple.coupleId,
        title: `默契问答：${question?.content ?? ''}`.slice(0, 120),
        content: lines.join('\n'),
        happenedOn: toISODate(),
        mood: 'heartbeat',
        category: '默契问答',
        visibility: 'shared',
        status: 'published',
      })
      await favoriteQuizToDiary(sessionId, diaryId, userId)
      void qc.invalidateQueries({ queryKey: ['diaries'] })
      void qc.invalidateQueries({ queryKey: ['sharedDiaries'] })
    },
    onSuccess: () => {
      setFavoriteTarget(null)
      invalidate()
    },
    onError: (err) => {
      setFavoriteTarget(null)
      setError(getErrorMessage(err))
    },
  })

  if (coupleQuery.isLoading || sessionsQuery.isLoading) {
    return <p className="py-8 text-center text-sm text-bark-soft">{zhCN.common.loading}</p>
  }

  const members = couple?.members ?? []
  const nicknameOf = (id: string) => members.find((m) => m.userId === id)?.nickname ?? 'TA'

  // ---------- 进行中的会话 ----------
  if (activeSession) {
    const question = questionById(activeSession.questionId)
    const myAnswer = activeSession.myAnswer
    const myDraft = myAnswer && !myAnswer.submitted ? myAnswer : null
    const displayText = answerText || myDraft?.content || myAnswer?.content || ''
    const displayEmoji = answerEmoji || myDraft?.emoji || myAnswer?.emoji || ''
    const iSubmitted = Boolean(myAnswer?.submitted)

    return (
      <div>
        <Card>
          <p className="text-xs text-bark-soft">
            {zhCN.quiz.questionLabel} · {question ? CATEGORY_LABEL[question.category] : ''}
          </p>
          <h2 className="mt-2 font-display text-xl leading-8 text-bark">{question?.content ?? ''}</h2>

          <div className="mt-4">
            <label className="block text-sm font-medium text-bark" htmlFor="quiz-answer">
              {zhCN.quiz.myAnswerLabel}
            </label>
            <textarea
              id="quiz-answer"
              className="mt-1 min-h-28 w-full rounded-2xl border border-paper-edge bg-paper px-3.5 py-2.5 text-sm leading-7 text-bark"
              maxLength={500}
              placeholder={zhCN.quiz.answerPlaceholder}
              value={displayText}
              disabled={iSubmitted}
              onChange={(e) => {
                setAnswerText(e.target.value)
                setDraftNotice('')
              }}
            />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-bark-soft">{zhCN.quiz.emojiLabel}</span>
              {EMOJI_CHOICES.map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-pressed={displayEmoji === e}
                  disabled={iSubmitted}
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-lg transition-colors ${
                    displayEmoji === e ? 'bg-leaf-gold/30' : 'hover:bg-paper-deep'
                  }`}
                  onClick={() => setAnswerEmoji(e)}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {error ? <p role="alert" className="mt-3 text-sm text-maple">{error}</p> : null}
          {draftNotice ? <p role="status" className="mt-3 text-xs text-forest-deep">{draftNotice}</p> : null}

          {iSubmitted ? (
            <div className="mt-4 rounded-2xl bg-forest/10 p-3.5 text-sm leading-6 text-forest-deep">
              {zhCN.quiz.submitted} · {activeSession.partnerAnswer ? '' : zhCN.quiz.waitingPartner}
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button disabled={saveMutation.isPending || displayText.trim().length === 0} onClick={() => saveMutation.mutate(true)}>
                {zhCN.quiz.submit}
              </Button>
              <Button variant="secondary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate(false)}>
                {zhCN.quiz.saveDraft}
              </Button>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-paper-edge/70 pt-3 text-xs">
            <span className="text-bark-soft">{zhCN.quiz.partnerNotYet}</span>
            <span className="flex gap-2">
              <button type="button" className="text-bark-soft underline underline-offset-2" onClick={() => endMutation.mutate()}>
                {zhCN.quiz.earlyEnd}
              </button>
              <button
                type="button"
                className="text-bark-soft underline underline-offset-2"
                title={zhCN.quiz.skipHint}
                onClick={() => skipMutation.mutate()}
              >
                {zhCN.quiz.skip}
              </button>
            </span>
          </div>
        </Card>
        <p className="mt-2 text-xs leading-5 text-bark-soft">{zhCN.quiz.earlyEndHint}</p>
      </div>
    )
  }

  // ---------- 历史会话 ----------
  const historyBlock = (
    <div className="mt-8">
      <h3 className="mb-3 text-sm font-medium text-bark-soft">{zhCN.quiz.historyTitle}</h3>
      {history.length === 0 ? (
        <p className="rounded-2xl bg-paper-deep p-3 text-xs text-bark-soft">{zhCN.quiz.historyEmpty}</p>
      ) : (
        <ul className="space-y-3">
          {history.map((session) => {
            const question = questionById(session.questionId)
            return (
              <li key={session.id}>
                <Card className="!p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-display text-base text-bark">{question?.content ?? ''}</p>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="rounded-full bg-paper-deep px-2 py-0.5 text-bark-soft">
                        {session.endedEarlyBy ? zhCN.quiz.earlyBadge : zhCN.quiz.revealedBadge}
                      </span>
                      {session.isFavorite ? <span className="text-leaf-gold">{zhCN.quiz.favorited} ✦</span> : null}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {session.myAnswer ? (
                      <div className="rounded-2xl bg-paper p-3">
                        <p className="text-xs text-bark-soft">
                          {nicknameOf(session.myAnswer.authorId)} · {zhCN.quiz.myAnswerLabel}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-bark">
                          {session.myAnswer.emoji ?? ''} {session.myAnswer.content}
                        </p>
                      </div>
                    ) : null}
                    {session.partnerAnswer ? (
                      <div className="rounded-2xl bg-paper p-3">
                        <p className="text-xs text-bark-soft">
                          {nicknameOf(session.partnerAnswer.authorId)} · {zhCN.quiz.partnerAnswerLabel}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-bark">
                          {session.partnerAnswer.emoji ?? ''} {session.partnerAnswer.content}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-paper-edge p-3 text-xs text-bark-soft">
                        {session.endedEarlyBy ? zhCN.quiz.earlyEndHint : zhCN.quiz.partnerNotYet}
                      </div>
                    )}
                  </div>
                  {!session.isFavorite && session.myAnswer ? (
                    <button
                      type="button"
                      className="mt-3 text-xs text-leaf-gold underline underline-offset-2"
                      onClick={() => setFavoriteTarget(session.id)}
                    >
                      {zhCN.quiz.favorite}
                    </button>
                  ) : null}
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )

  // ---------- 抽题 ----------
  const picked = pickedId ? questionById(pickedId) : null
  return (
    <div>
      <Card>
        <h2 className="font-display text-lg text-bark">{zhCN.quiz.startTitle}</h2>
        <p className="mt-1 text-xs leading-5 text-bark-soft">{zhCN.quiz.intro}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          {(['all', 'light', 'memory', 'future', 'know'] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={pickTab === key}
              onClick={() => {
                setPickTab(key)
                setPickedId(null)
              }}
              className={`min-h-9 rounded-full border px-3 text-xs transition-colors ${
                pickTab === key ? 'border-bark bg-bark text-paper' : 'border-paper-edge bg-card text-bark-soft hover:text-bark'
              }`}
            >
              {key === 'all' ? zhCN.quiz.categoryAll : CATEGORY_LABEL[key]}
            </button>
          ))}
        </div>

        {picked ? (
          <div className="mt-4 rounded-2xl border border-paper-edge bg-paper p-4">
            <p className="text-xs text-bark-soft">
              {zhCN.quiz.questionLabel} · {CATEGORY_LABEL[picked.category]}
            </p>
            <p className="mt-1.5 font-display text-lg leading-8 text-bark">{picked.content}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => startMutation.mutate(picked.id)} disabled={startMutation.isPending}>
                {zhCN.quiz.beginAnswer}
              </Button>
              <Button variant="ghost" onClick={() => setPickedId(null)}>
                {zhCN.quiz.reroll}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            className="mt-4"
            variant="secondary"
            onClick={() => setPickedId(pickQuestion(pickTab === 'all' ? 'all' : pickTab, usedQuestionIds).id)}
          >
            {zhCN.quiz.pickCategory}
          </Button>
        )}
        {error ? <p role="alert" className="mt-3 text-sm text-maple">{error}</p> : null}
      </Card>

      {historyBlock}

      <ConfirmDialog
        open={favoriteTarget !== null}
        title={zhCN.quiz.favoriteConfirmTitle}
        description={zhCN.quiz.favoriteConfirmBody}
        confirmLabel={zhCN.quiz.favorite}
        busy={favoriteMutation.isPending}
        onConfirm={() => favoriteTarget && favoriteMutation.mutate(favoriteTarget)}
        onCancel={() => setFavoriteTarget(null)}
      />
    </div>
  )
}
