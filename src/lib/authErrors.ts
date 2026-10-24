/**
 * 把 Supabase Auth 的英文错误映射为友好中文。
 * 只映射已知错误码，未知的走通用文案，不透出原始报错。
 */
import { t } from '@/i18n'

export function authErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const table: ReadonlyArray<readonly [RegExp, string]> = [
    [/invalid login credentials/i, t('auth.errors.invalidCredentials')],
    [/user already registered|already been registered/i, t('auth.errors.emailTaken')],
    [/password should be at least/i, t('auth.errors.weakPassword')],
    [/invalid format for email|unable to validate email/i, t('auth.errors.invalidEmail')],
    [/rate limit|too many requests/i, t('auth.errors.rateLimited')],
    [/failed to fetch|networkerror|network error/i, t('auth.errors.network')],
  ]
  for (const [pattern, text] of table) {
    if (pattern.test(message)) return text
  }
  return t('auth.errors.unknown')
}
