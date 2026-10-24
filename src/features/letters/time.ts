/**
 * 时光邮局时间工具：
 * 「datetime-local 输入（本地时区）→ UTC ISO 存储 → 按本地时区展示」
 * 全链路只经过这两个换算，避免跨时区/夏令时的手动计算错误。
 */

/** 'YYYY-MM-DDTHH:mm'（本地时区）→ UTC ISO 字符串 */
export function localInputToUTC(value: string): string {
  const d = new Date(value) // 按本地时区解析
  if (Number.isNaN(d.getTime())) throw new Error(`无效的时间输入: ${value}`)
  return d.toISOString()
}

/** UTC ISO → 'YYYY-MM-DDTHH:mm'（本地时区，用于表单回显） */
export function utcToLocalInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) throw new Error(`无效的时间: ${iso}`)
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** UTC ISO → 本地时区可读文案，如「2027年5月20日 08:00」 */
export function formatUnlockTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 是否已到解锁时间（以当前设备时钟做 UI 提示；真正的门禁在服务端） */
export function isUnlocked(unlockAtIso: string, now: Date = new Date()): boolean {
  return now.getTime() >= new Date(unlockAtIso).getTime()
}

/** 距解锁还剩多久的人性化文案（天/小时/分钟） */
export function remainingText(unlockAtIso: string, now: Date = new Date()): string {
  const ms = new Date(unlockAtIso).getTime() - now.getTime()
  if (ms <= 0) return ''
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} 小时`
  return `${Math.floor(hours / 24)} 天`
}
