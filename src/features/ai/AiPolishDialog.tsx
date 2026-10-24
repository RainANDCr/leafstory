/**
 * AI 润色对话框：选素材（默认全不选）→ 预览将发送的确切内容 + 费用告知
 * → 二次确认后请求 → 原文/建议对照（重新生成 / 复制 / 存为新草稿）。
 * 原始日记绝不被改动；保存草稿需再次确认；请求可随时取消。
 */
import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useAiSettings } from './AiSettings'
import {
  AI_LENGTHS,
  AI_STYLES,
  DEFAULT_AI_OPTIONS,
  lengthInstruction,
  styleInstruction,
  styleLabel,
  type AiLengthKey,
  type AiOptions,
  type AiStyleKey,
} from './config'
import { buildSystemPrompt, buildUserPrompt, estimateChars, type AiMaterial } from './prompt'
import { AiError, callAiModel } from './provider'
import { createDiary } from '@/services/diaryService'
import { useAuth } from '@/features/auth/AuthContext'
import { useCoupleSnapshot } from '@/features/couple/useCoupleSnapshot'
import { toISODate } from '@/lib/dates'
import { zhCN } from '@/i18n'
import type { DiaryEntry } from '@/features/diary/types'

interface AiPolishDialogProps {
  open: boolean
  /** 候选素材（调用方已按当前用户可见性过滤） */
  candidates: readonly DiaryEntry[]
  /** 单篇场景下预先勾选该篇（用户是从这一篇点进来的） */
  preselectId?: string | null
  /** 存草稿时的标题来源（单篇为其标题；整章为章节名） */
  contextTitle?: string
  onClose: () => void
}

type Step = 'select' | 'confirm' | 'result'

export function AiPolishDialog({ open, candidates, preselectId, contextTitle, onClose }: AiPolishDialogProps) {
  const { settings, isReady } = useAiSettings()
  const { userId } = useAuth()
  const coupleQuery = useCoupleSnapshot()
  const qc = useQueryClient()

  const [step, setStep] = useState<Step>('select')
  const [selectedIds, setSelectedIds] = useState<string[]>(preselectId ? [preselectId] : [])
  const [options, setOptions] = useState<AiOptions>(DEFAULT_AI_OPTIONS)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saveDraftOpen, setSaveDraftOpen] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const coupleId = coupleQuery.data?.info?.coupleId ?? null

  if (!open) return null

  const materials: AiMaterial[] = candidates
    .filter((e) => selectedIds.includes(e.id))
    .map((e) => ({ id: e.id, title: e.title, happenedOn: e.happenedOn, content: e.content }))

  const optionArgs = {
    styleInstruction: styleInstruction(options.style),
    lengthInstruction: lengthInstruction(options.length),
    keepOriginal: options.keepOriginal,
    leafImagery: options.leafImagery,
  }

  function toggle(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function aiErrorText(kind: string): string {
    const table: Record<string, string> = {
      not_configured: zhCN.ai.errors.notConfigured,
      key_invalid: zhCN.ai.errors.keyInvalid,
      rate_limited: zhCN.ai.errors.rateLimited,
      timeout: zhCN.ai.errors.timeout,
      aborted: zhCN.ai.errors.aborted,
      empty: zhCN.ai.emptyResult,
      request_failed: zhCN.ai.errors.requestFailed,
    }
    return table[kind] ?? zhCN.ai.errors.requestFailed
  }

  async function run() {
    setError('')
    setResult('')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const text = await callAiModel({
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
        mock: settings.mock,
        mockStyleLabel: styleLabel(options.style),
        proxyUrl: import.meta.env.VITE_AI_PROXY_URL || undefined,
        system: buildSystemPrompt(),
        user: buildUserPrompt(materials, optionArgs),
        signal: controller.signal,
      })
      setResult(text)
      setStep('result')
    } catch (err) {
      const kind = err instanceof AiError ? err.kind : 'request_failed'
      setError(aiErrorText(kind))
      if (kind === 'not_configured') setStep('select')
    } finally {
      abortRef.current = null
    }
  }

  async function saveAsDraft() {
    if (!coupleId || !userId) {
      setError(zhCN.ai.errors.saveFailed)
      return
    }
    setSavingDraft(true)
    try {
      const baseTitle = contextTitle ?? materials[0]?.title ?? ''
      await createDiary({
        coupleId,
        title: `${baseTitle || '无题'}（AI 润色稿·${styleLabel(options.style)}）`.slice(0, 120),
        content: result,
        happenedOn: toISODate(),
        mood: 'joy',
        category: 'AI 润色稿',
        visibility: 'shared',
        status: 'draft',
      })
      void qc.invalidateQueries({ queryKey: ['diaries'] })
      setNotice(zhCN.ai.saved)
      window.setTimeout(onClose, 900)
    } catch {
      setError(zhCN.ai.errors.saveFailed)
    } finally {
      setSavingDraft(false)
    }
  }

  const userPromptText = buildUserPrompt(materials, optionArgs)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={zhCN.ai.title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-bark-deep/50 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          abortRef.current?.abort()
          onClose()
        }
      }}
    >
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-card border border-paper-edge bg-card shadow-lift sm:rounded-card">
        <header className="flex items-center justify-between border-b border-paper-edge px-5 py-3.5">
          <h2 className="font-display text-lg text-bark">{zhCN.ai.title}</h2>
          <button
            type="button"
            aria-label={zhCN.common.cancel}
            className="min-h-9 px-2 text-bark-soft"
            onClick={() => {
              abortRef.current?.abort()
              onClose()
            }}
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 'select' ? (
            <div className="space-y-4">
              {!isReady ? (
                <p className="rounded-2xl border border-leaf-gold/40 bg-leaf-gold/10 p-3 text-xs leading-5 text-bark">
                  {zhCN.ai.errors.notConfigured}
                </p>
              ) : null}

              <fieldset>
                <legend className="text-sm font-medium text-bark">{zhCN.ai.selectEntries}</legend>
                <p className="mt-0.5 text-xs leading-5 text-bark-soft">{zhCN.ai.selectHint}</p>
                <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto">
                  {candidates.map((e) => (
                    <li key={e.id}>
                      <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1 text-sm text-bark hover:bg-paper-deep">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-bark"
                          checked={selectedIds.includes(e.id)}
                          onChange={() => toggle(e.id)}
                        />
                        <span className="text-xs text-bark-soft">{e.happenedOn}</span>
                        <span className="truncate">{e.title || '无题'}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-bark-soft">{estimateChars(e.content)} 字</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-bark" htmlFor="ai-style">
                    {zhCN.ai.styleLabel}
                  </label>
                  <select
                    id="ai-style"
                    className="mt-1 w-full min-h-11 rounded-2xl border border-paper-edge bg-paper px-3.5 py-2 text-sm text-bark"
                    value={options.style}
                    onChange={(e) => setOptions((o) => ({ ...o, style: e.target.value as AiStyleKey }))}
                  >
                    {AI_STYLES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-bark" htmlFor="ai-length">
                    {zhCN.ai.lengthLabel}
                  </label>
                  <select
                    id="ai-length"
                    className="mt-1 w-full min-h-11 rounded-2xl border border-paper-edge bg-paper px-3.5 py-2 text-sm text-bark"
                    value={options.length}
                    onChange={(e) => setOptions((o) => ({ ...o, length: e.target.value as AiLengthKey }))}
                  >
                    {AI_LENGTHS.map((l) => (
                      <option key={l.key} value={l.key}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-bark"
                    checked={options.keepOriginal}
                    onChange={(e) => setOptions((o) => ({ ...o, keepOriginal: e.target.checked }))}
                  />
                  <span className="text-sm text-bark">{zhCN.ai.keepOriginal}</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-bark"
                    checked={options.leafImagery}
                    onChange={(e) => setOptions((o) => ({ ...o, leafImagery: e.target.checked }))}
                  />
                  <span className="text-sm text-bark">{zhCN.ai.leafImagery}</span>
                </label>
              </div>

              {error ? (
                <p role="alert" className="text-sm text-maple">
                  {error}
                </p>
              ) : null}
            </div>
          ) : step === 'confirm' ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-maple/40 bg-maple/5 p-4">
                <p className="text-sm font-medium text-bark">{zhCN.ai.sendConfirmTitle}</p>
                <p className="mt-1.5 text-xs leading-5 text-bark-soft">{zhCN.ai.sendConfirmBody}</p>
                <p className="mt-1.5 text-xs text-bark-soft">
                  {settings.mock
                    ? zhCN.ai.mockOn
                    : `${settings.model} · ${materials.length} 篇 · 约 ${estimateChars(userPromptText)} 字`}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-bark">{zhCN.ai.materialPreview}</p>
                <p className="mt-0.5 text-xs text-bark-soft">{zhCN.ai.materialNote}</p>
                <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-paper-edge bg-paper p-3 text-xs leading-5 text-bark">
                  {userPromptText}
                </pre>
              </div>
              {error ? (
                <p role="alert" className="text-sm text-maple">
                  {error}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="rounded-2xl bg-forest/10 p-3 text-xs leading-5 text-forest-deep">{zhCN.ai.resultNote}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-bark-soft">{zhCN.ai.original}</p>
                  <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-paper-edge bg-paper p-3 text-sm leading-7 text-bark">
                    {materials.map((m) => `【${m.happenedOn}｜${m.title || '无题'}】\n${m.content}`).join('\n\n')}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-leaf-gold">{zhCN.ai.result}</p>
                  <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-leaf-gold/40 bg-leaf-gold/5 p-3 text-sm leading-7 text-bark">
                    {result}
                  </div>
                </div>
              </div>
              {notice ? (
                <p role="status" className="text-sm text-forest-deep">
                  {notice}
                </p>
              ) : null}
              {error ? (
                <p role="alert" className="text-sm text-maple">
                  {error}
                </p>
              ) : null}
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-paper-edge px-5 py-3.5">
          {step === 'select' ? (
            <>
              <Button variant="ghost" onClick={onClose}>
                {zhCN.common.cancel}
              </Button>
              <Button
                disabled={!isReady || selectedIds.length === 0}
                onClick={() => {
                  if (selectedIds.length === 0) {
                    setError(zhCN.ai.mustSelect)
                    return
                  }
                  setError('')
                  setStep('confirm')
                }}
              >
                {zhCN.common.confirm}
              </Button>
            </>
          ) : step === 'confirm' ? (
            <>
              <Button variant="ghost" onClick={() => setStep('select')}>
                {zhCN.ai.backToSelect}
              </Button>
              <Button onClick={() => void run()}>🚀 {zhCN.ai.send}</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep('select')}>
                {zhCN.ai.backToSelect}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(result)
                    .then(() => setNotice(zhCN.ai.copied))
                    .catch(() => setNotice(''))
                }}
              >
                {zhCN.ai.copy}
              </Button>
              <Button variant="secondary" onClick={() => void run()}>
                {zhCN.ai.regenerate}
              </Button>
              <Button onClick={() => setSaveDraftOpen(true)}>{zhCN.ai.saveDraft}</Button>
            </>
          )}
        </footer>
      </div>

      <ConfirmDialog
        open={saveDraftOpen}
        title={zhCN.ai.saveDraftConfirmTitle}
        description={zhCN.ai.saveDraftConfirmBody}
        confirmLabel={zhCN.ai.saveDraft}
        busy={savingDraft}
        onConfirm={() => {
          setSaveDraftOpen(false)
          void saveAsDraft()
        }}
        onCancel={() => setSaveDraftOpen(false)}
      />
    </div>
  )
}
