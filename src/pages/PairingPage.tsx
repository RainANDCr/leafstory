/**
 * 配对页：未配对（创建/加入）→ 待配对（邀请码管理）→ 已配对。
 * 邀请码校验、人数上限全部由数据库 RPC 保证；本页只做展示与错误映射。
 */
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { LoadingState } from '@/components/feedback/LoadingState'
import { CopyButton } from '@/components/ui/CopyButton'
import { useAuth } from '@/features/auth/AuthContext'
import { useCoupleSnapshot, useInvalidateCouple } from '@/features/couple/useCoupleSnapshot'
import { createCoupleSpace, getPendingInvitation, joinCouple, regenerateInvitation } from '@/services/coupleService'
import { formatDateHuman } from '@/lib/dates'
import { t } from '@/i18n'

/** 把数据库 RPC 的中文异常映射为界面文案（消息本身已是无敏感信息的用户提示） */
function mapCoupleError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  if (msg.includes('已经属于')) return t('pairing.errors.alreadyInCouple')
  if (msg.includes('无效或已过期')) return t('pairing.errors.codeInvalid')
  if (msg.includes('两位成员')) return t('pairing.errors.coupleFull')
  return t('pairing.errors.unknown')
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', { hour12: false })
}

export function PairingPage() {
  const { userId, ready } = useAuth()
  const coupleQuery = useCoupleSnapshot()
  const invalidate = useInvalidateCouple()

  const [spaceName, setSpaceName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  /** 刚生成/重新生成的邀请码（明文只在本地状态短暂存在） */
  const [generated, setGenerated] = useState<{ code: string; expiresAt: string } | null>(null)

  // 待用邀请元数据（剩余有效期），用于刷新后仍能显示「等待中」状态
  const pendingQuery = useQuery({
    queryKey: ['pendingInvitation', userId],
    queryFn: () => getPendingInvitation(),
    enabled: ready && Boolean(userId) && coupleQuery.data?.state === 'waiting',
  })

  if (!ready || coupleQuery.isLoading) return <LoadingState />

  const snapshot = coupleQuery.data ?? { state: 'unpaired' as const, info: null }
  const inputCls =
    'mt-1 w-full min-h-11 rounded-2xl border border-paper-edge bg-paper px-3.5 py-2 text-sm text-bark placeholder:text-bark-soft/60'

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const inviteCode = await createCoupleSpace(spaceName)
      setGenerated({ code: inviteCode, expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString() })
      invalidate()
    } catch (err) {
      setError(mapCoupleError(err))
    } finally {
      setBusy(false)
    }
  }

  async function onJoin(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await joinCouple(code)
      setCode('')
      invalidate()
    } catch (err) {
      setError(mapCoupleError(err))
    } finally {
      setBusy(false)
    }
  }

  async function onRegenerate() {
    setError('')
    setBusy(true)
    try {
      const result = await regenerateInvitation()
      setGenerated(result)
      invalidate()
    } catch (err) {
      setError(mapCoupleError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title={t('pairing.title')} description={t('pairing.intro')} />
      {error ? (
        <p role="alert" className="mb-4 rounded-2xl border border-maple/40 bg-maple/5 p-3 text-sm text-maple">
          {error}
        </p>
      ) : null}

      {/* ---------- 未配对 ---------- */}
      {snapshot.state === 'unpaired' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <h2 className="font-display text-base text-bark">{t('pairing.createSpace')}</h2>
            <form className="mt-3" onSubmit={onCreate}>
              <label className="block text-sm font-medium text-bark" htmlFor="space-name">
                {t('pairing.spaceNameLabel')}
              </label>
              <input
                id="space-name"
                className={inputCls}
                placeholder={t('pairing.spaceNamePlaceholder')}
                maxLength={30}
                value={spaceName}
                onChange={(e) => setSpaceName(e.target.value)}
                disabled={busy}
              />
              <Button type="submit" className="mt-4 w-full" disabled={busy}>
                {busy ? t('common.saving') : t('pairing.createAction')}
              </Button>
            </form>
          </Card>

          <Card>
            <h2 className="font-display text-base text-bark">{t('pairing.joinTitle')}</h2>
            <p className="mt-1 text-xs leading-5 text-bark-soft">{t('pairing.joinDesc')}</p>
            <form className="mt-3" onSubmit={onJoin}>
              <label className="block text-sm font-medium text-bark" htmlFor="join-code">
                {t('pairing.codeLabel')}
              </label>
              <input
                id="join-code"
                className={`${inputCls} font-mono tracking-widest uppercase`}
                placeholder={t('pairing.codePlaceholder')}
                maxLength={12}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                disabled={busy}
              />
              <Button type="submit" variant="secondary" className="mt-4 w-full" disabled={busy || code.length < 6}>
                {busy ? t('common.saving') : t('pairing.joinAction')}
              </Button>
            </form>
          </Card>
        </div>
      ) : null}

      {/* ---------- 待配对：展示邀请码 ---------- */}
      {snapshot.state === 'waiting' ? (
        <Card>
          <h2 className="font-display text-base text-bark">{t('pairing.stateWaiting')}</h2>

          {generated ? (
            <div className="mt-4">
              <p className="text-sm text-bark-soft">{t('pairing.codeGenerated')}</p>
              <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-leaf-gold/40 bg-leaf-gold/10 px-4 py-3">
                <code className="font-mono text-2xl tracking-[0.3em] text-bark">{generated.code}</code>
                <CopyButton text={generated.code} />
              </div>
              <p className="mt-2 text-xs leading-5 text-bark-soft">
                {t('pairing.codeOnceHint')}
                {pendingQuery.data || generated ? null : ''}
              </p>
              <p className="mt-1 text-xs text-bark-soft">
                {t('pairing.validUntil')}：{formatTime(generated.expiresAt)}
              </p>
            </div>
          ) : pendingQuery.data ? (
            <div className="mt-4">
              <p className="text-sm leading-6 text-bark-soft">
                {t('pairing.waitingHint')}
                <br />
                {t('pairing.validUntil')}：{formatTime(pendingQuery.data.expiresAt)}
              </p>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-sm leading-6 text-bark-soft">
                {t('pairing.codeExpired')}
                <br />
                {t('pairing.codeExpiredHint')}
              </p>
            </div>
          )}

          <div className="mt-4">
            <Button variant="secondary" onClick={onRegenerate} disabled={busy}>
              {busy ? t('common.saving') : t('pairing.regenerate')}
            </Button>
          </div>
        </Card>
      ) : null}

      {/* ---------- 已配对 ---------- */}
      {snapshot.state === 'paired' && snapshot.info ? (
        <Card>
          <h2 className="font-display text-base text-bark">{t('pairing.statePaired')}</h2>
          <p className="mt-1 text-xs text-bark-soft">
            {t('pairing.pairedOn')}：{formatDateHuman(snapshot.info.createdAt.slice(0, 10))}
          </p>
          <ul className="mt-4 space-y-3">
            {snapshot.info.members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between rounded-2xl bg-paper-deep px-4 py-3">
                <span className="text-sm text-bark">{m.nickname}</span>
                <span className="rounded-full border border-paper-edge bg-card px-2.5 py-1 text-[11px] text-bark-soft">
                  {m.role === 'founder' ? t('pairing.founder') : t('pairing.member')}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-5">
            <Link
              to="/forest"
              className="inline-flex min-h-11 items-center rounded-2xl bg-bark px-4 text-sm font-medium text-paper transition-colors hover:bg-bark-deep"
            >
              {t('pairing.goForest')}
            </Link>
          </div>
        </Card>
      ) : null}
    </>
  )
}
