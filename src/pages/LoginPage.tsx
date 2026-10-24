/**
 * 登录 / 注册 / 找回密码。
 * 未配置 Supabase 时明确提示并禁用表单，不假装可用。
 */
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { MonkeyMascot } from '@/components/MonkeyMascot'
import { useAuth } from '@/features/auth/AuthContext'
import { requestPasswordReset, signIn, signUp, signOut } from '@/services/authService'
import { authErrorMessage } from '@/lib/authErrors'
import { isSupabaseConfigured } from '@/lib/env'
import { t } from '@/i18n'

type Mode = 'login' | 'register' | 'forgot'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useAuth()

  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const from = (location.state as { from?: string } | null)?.from ?? '/forest'
  const configured = isSupabaseConfigured

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
        navigate(from, { replace: true })
      } else if (mode === 'register') {
        const directSession = await signUp(email, password, nickname)
        if (directSession) {
          navigate(from, { replace: true })
        } else {
          setNotice(t('auth.verifyEmail'))
        }
      } else {
        await requestPasswordReset(email)
        setNotice(t('auth.resetSent'))
      }
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'mt-1 w-full min-h-11 rounded-2xl border border-paper-edge bg-paper px-3.5 py-2 text-sm text-bark placeholder:text-bark-soft/60'
  const labelCls = 'block text-sm font-medium text-bark'

  return (
    <div className="mx-auto max-w-sm py-6">
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MonkeyMascot className="w-14" label="" />
            <div>
              <h1 className="font-display text-xl text-bark">
                {mode === 'login' ? t('auth.loginTitle') : mode === 'register' ? t('auth.registerTitle') : t('auth.forgotTitle')}
              </h1>
              <p className="text-xs text-bark-soft">{t('login.desc')}</p>
            </div>
          </div>
          {session ? (
            <button
              type="button"
              className="text-xs text-bark-soft underline underline-offset-2"
              onClick={() => void signOut()}
            >
              {t('auth.signOut')}
            </button>
          ) : null}
        </div>

        {mode !== 'forgot' ? (
          <div className="mb-4 flex rounded-2xl bg-paper-deep p-1 text-sm" role="tablist">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                className={`min-h-10 flex-1 rounded-xl transition-colors ${
                  mode === m ? 'bg-card text-bark shadow-soft' : 'text-bark-soft'
                }`}
                onClick={() => {
                  setMode(m)
                  setError('')
                  setNotice('')
                }}
              >
                {m === 'login' ? t('auth.loginTab') : t('auth.registerTab')}
              </button>
            ))}
          </div>
        ) : null}

        {!configured ? (
          <p className="mb-4 rounded-2xl border border-leaf-gold/40 bg-leaf-gold/10 p-3 text-xs leading-5 text-bark">
            {t('auth.needConfig')}
          </p>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className={labelCls} htmlFor="auth-email">
              {t('auth.email')}
            </label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              className={inputCls}
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!configured || busy}
            />
          </div>

          {mode === 'register' ? (
            <div>
              <label className={labelCls} htmlFor="auth-nickname">
                {t('auth.nickname')}
              </label>
              <input
                id="auth-nickname"
                className={inputCls}
                placeholder={t('auth.nicknamePlaceholder')}
                value={nickname}
                maxLength={30}
                onChange={(e) => setNickname(e.target.value)}
                disabled={!configured || busy}
              />
            </div>
          ) : null}

          {mode !== 'forgot' ? (
            <div>
              <div className="flex items-center justify-between">
                <label className={labelCls} htmlFor="auth-password">
                  {t('auth.password')}
                </label>
                {mode === 'login' ? (
                  <button
                    type="button"
                    className="text-xs text-bark-soft underline underline-offset-2"
                    onClick={() => {
                      setMode('forgot')
                      setError('')
                      setNotice('')
                    }}
                  >
                    {t('auth.forgotLink')}
                  </button>
                ) : null}
              </div>
              <input
                id="auth-password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                className={inputCls}
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!configured || busy}
              />
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-maple">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="rounded-2xl bg-forest/10 p-3 text-sm leading-6 text-forest-deep">
              {notice}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={!configured || busy}>
            {busy
              ? t('common.saving')
              : mode === 'login'
                ? t('auth.signIn')
                : mode === 'register'
                  ? t('auth.signUp')
                  : t('auth.sendReset')}
          </Button>
        </form>

        {mode === 'forgot' ? (
          <button
            type="button"
            className="mt-3 w-full text-center text-xs text-bark-soft underline underline-offset-2"
            onClick={() => {
              setMode('login')
              setError('')
              setNotice('')
            }}
          >
            {t('auth.backToLogin')}
          </button>
        ) : null}

        <p className="mt-4 text-center text-xs text-bark-soft">
          <Link to="/forest" className="underline underline-offset-2">
            {t('login.backToForest')}
          </Link>
        </p>
      </Card>
    </div>
  )
}
