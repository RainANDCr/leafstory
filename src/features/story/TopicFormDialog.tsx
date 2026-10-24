/** 自定义专题编辑器：标题、序言、封面色、选择日记并排序（打开时经 key 重挂载初始化） */
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { MOODS, getMood, type DiaryEntry } from '@/features/diary/types'
import { formatDateShort } from '@/lib/dates'
import { zhCN } from '@/i18n'
import type { StoryBook } from '@/services/storyService'

interface TopicFormDialogProps {
  open: boolean
  /** 编辑时传入既有专题（含已选日记 ID 顺序）；新建为 null */
  initial: { book: StoryBook; entryIds: string[] } | null
  /** 可选的日记（当前用户可见） */
  entries: readonly DiaryEntry[]
  busy?: boolean
  onSubmit: (input: { title: string; intro: string | null; coverMood: string | null; entryIds: string[] }) => void
  onCancel: () => void
}

export function TopicFormDialog({ open, initial, entries, busy, onSubmit, onCancel }: TopicFormDialogProps) {
  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={initial ? zhCN.story.editTopic : zhCN.story.newTopic}
      className="fixed inset-0 z-50 flex items-end justify-center bg-bark-deep/40 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <TopicForm key={initial?.book.id ?? 'new'} initial={initial} entries={entries} busy={busy} onSubmit={onSubmit} onCancel={onCancel} />
    </div>
  )
}

function TopicForm({
  initial,
  entries,
  busy,
  onSubmit,
  onCancel,
}: Omit<TopicFormDialogProps, 'open'> & { initial: { book: StoryBook; entryIds: string[] } | null }) {
  const [title, setTitle] = useState(initial?.book.title ?? '')
  const [intro, setIntro] = useState(initial?.book.intro ?? '')
  const [coverMood, setCoverMood] = useState(initial?.book.coverMood ?? 'joy')
  const [selected, setSelected] = useState<string[]>(initial?.entryIds ?? [])
  const [error, setError] = useState('')

  const entryMap = new Map(entries.map((e) => [e.id, e]))

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function move(index: number, delta: -1 | 1) {
    setSelected((prev) => {
      const next = [...prev]
      const target = index + delta
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target]!, next[index]!]
      return next
    })
  }

  function submit() {
    if (title.trim().length === 0) {
      setError(zhCN.anniversaries.errors.titleRequired)
      return
    }
    onSubmit({ title, intro: intro.trim() || null, coverMood, entryIds: selected })
  }

  const labelCls = 'block text-sm font-medium text-bark'
  const inputCls =
    'mt-1 w-full min-h-11 rounded-2xl border border-paper-edge bg-paper px-3.5 py-2 text-sm text-bark placeholder:text-bark-soft/60'

  return (
    <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-card border border-paper-edge bg-card p-5 shadow-lift sm:rounded-card">
      <h2 className="font-display text-lg text-bark">{initial ? zhCN.story.editTopic : zhCN.story.newTopic}</h2>

      <div className="mt-4 space-y-4">
        <div>
          <label className={labelCls} htmlFor="topic-title">
            {zhCN.story.fieldTitle}
          </label>
          <input
            id="topic-title"
            className={inputCls}
            value={title}
            maxLength={60}
            placeholder={zhCN.story.titlePlaceholder}
            onChange={(e) => setTitle(e.target.value)}
          />
          {error ? <p className="mt-1 text-xs text-maple">{error}</p> : null}
        </div>

        <div>
          <label className={labelCls} htmlFor="topic-intro">
            {zhCN.story.fieldIntro}
          </label>
          <textarea
            id="topic-intro"
            className={`${inputCls} min-h-20`}
            maxLength={500}
            placeholder={zhCN.story.introPlaceholder}
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
          />
        </div>

        <div>
          <p className={labelCls}>{zhCN.story.fieldCover}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {MOODS.map((m) => (
              <button
                key={m.key}
                type="button"
                aria-pressed={coverMood === m.key}
                aria-label={m.label}
                onClick={() => setCoverMood(m.key)}
                className={`flex min-h-11 w-11 items-center justify-center rounded-2xl border-2 transition-colors ${
                  coverMood === m.key ? 'border-bark' : 'border-paper-edge'
                }`}
              >
                <span aria-hidden="true" className="h-6 w-6 rounded-full" style={{ backgroundColor: m.color }} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className={labelCls}>{zhCN.story.fieldEntries}</p>
          <p className="mt-0.5 text-xs text-bark-soft">{zhCN.story.entriesHint}</p>

          {entries.length === 0 ? (
            <p className="mt-2 rounded-2xl bg-paper-deep p-3 text-xs text-bark-soft">{zhCN.story.noEntries}</p>
          ) : (
            <>
              {/* 可选日记 */}
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {entries.map((e) => (
                  <li key={e.id}>
                    <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1 text-sm text-bark hover:bg-paper-deep">
                      <input type="checkbox" className="h-4 w-4 accent-bark" checked={selected.includes(e.id)} onChange={() => toggle(e.id)} />
                      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getMood(e.mood).color }} />
                      <span className="text-xs text-bark-soft">{formatDateShort(e.happenedOn)}</span>
                      <span className="truncate">{e.title || '无题'}</span>
                    </label>
                  </li>
                ))}
              </ul>

              {/* 已选顺序 */}
              {selected.length > 0 ? (
                <div className="mt-3 rounded-2xl border border-paper-edge bg-paper p-3">
                  <p className="mb-2 text-xs font-medium text-bark">{zhCN.story.selectedCount(selected.length)}</p>
                  <ol className="space-y-1">
                    {selected.map((id, i) => {
                      const e = entryMap.get(id)
                      return (
                        <li key={id} className="flex items-center justify-between gap-2 text-sm text-bark">
                          <span className="truncate">
                            {i + 1}. {e ? e.title || '无题' : '（已不可见）'}
                          </span>
                          <span className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              aria-label={zhCN.story.moveUp}
                              className="h-8 w-8 rounded-lg border border-paper-edge bg-card text-xs"
                              disabled={i === 0}
                              onClick={() => move(i, -1)}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              aria-label={zhCN.story.moveDown}
                              className="h-8 w-8 rounded-lg border border-paper-edge bg-card text-xs"
                              disabled={i === selected.length - 1}
                              onClick={() => move(i, 1)}
                            >
                              ↓
                            </button>
                          </span>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {zhCN.common.cancel}
        </Button>
        <Button onClick={submit} disabled={busy}>
          {busy ? zhCN.common.saving : zhCN.story.saveBook}
        </Button>
      </div>
    </div>
  )
}
