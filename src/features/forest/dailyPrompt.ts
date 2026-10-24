/**
 * 每日记录提示：按日期确定性轮换（同一天两人看到同一条），
 * 只是写作灵感建议，不评价、不推断用户情感状态。
 */
const prompts = [
  '今天有没有一件小事，让你想起对方？',
  '写下今天吃到的一样好吃的。',
  '今天最想记住的一个瞬间是什么？',
  '如果今天是一种颜色，会是什么颜色？',
  '记下一句今天说过的话。',
  '今天的天气，和心情像吗？',
  '有什么想对对方说、但还没说出口的话？',
] as const

export function dailyPrompt(date: Date = new Date()): string {
  const start = Date.UTC(date.getFullYear(), 0, 1)
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  const dayOfYear = Math.floor((today - start) / 86_400_000)
  return prompts[((dayOfYear % prompts.length) + prompts.length) % prompts.length]!
}
