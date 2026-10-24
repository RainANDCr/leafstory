/**
 * 本地模式的 JSON 存储（localStorage）。
 *
 * 仅在未配置 Supabase 时使用：所有数据只存在于这台设备的浏览器里。
 * 键名统一加 leafstory: 前缀；读写失败时安全回退，不让页面崩溃。
 */

const PREFIX = 'leafstory:'

export const LS_KEYS = {
  accounts: 'accounts',
  session: 'session',
  profiles: 'profiles',
  couples: 'couples',
  members: 'members',
  invitations: 'invitations',
  diaries: 'diaries',
  diaryMedia: 'diary_media',
  anniversaries: 'anniversaries',
} as const

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeJSON(key: string, value: unknown): void {
  localStorage.setItem(PREFIX + key, JSON.stringify(value))
}

/** 清空本应用全部本地数据（危险操作，仅在用户明确要求时调用） */
export function clearAllLocalData(): void {
  for (const key of Object.values(LS_KEYS)) {
    localStorage.removeItem(PREFIX + key)
  }
}
