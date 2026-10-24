/**
 * 初始题库（与数据库迁移 00005 的种子一一对应，固定 UUID）。
 * 原则：温暖、尊重边界、不强迫公开隐私、无优劣对错——
 * 目的是「发现彼此不同的视角」，不做任何评分或情感判定。
 */

export type QuizCategory = 'light' | 'memory' | 'future' | 'know'

export interface QuizQuestion {
  id: string
  category: QuizCategory
  content: string
}

export const CATEGORY_LABEL: Record<QuizCategory, string> = {
  light: '轻松',
  memory: '回忆',
  future: '未来',
  know: '认识彼此',
}

export const QUESTION_BANK: readonly QuizQuestion[] = [
  // 轻松
  { id: '11111111-1111-4111-8111-111111111101', category: 'light', content: '如果用一种食物形容今天，会是什么？' },
  { id: '11111111-1111-4111-8111-111111111102', category: 'light', content: '最近有什么小事让你笑出了声？' },
  { id: '11111111-1111-4111-8111-111111111103', category: 'light', content: '如果今天是一种天气，会是什么天气？' },
  { id: '11111111-1111-4111-8111-111111111104', category: 'light', content: '你现在最想吃到的一样东西是什么？' },
  { id: '11111111-1111-4111-8111-111111111105', category: 'light', content: '最近单曲循环的一首歌是什么？为什么？' },
  { id: '11111111-1111-4111-8111-111111111106', category: 'light', content: '如果这个周末突然多出一天，你想怎么过？' },
  // 回忆
  { id: '22222222-2222-4222-8222-222222222201', category: 'memory', content: '第一次见面时，你注意到了对方什么？' },
  { id: '22222222-2222-4222-8222-222222222202', category: 'memory', content: '哪一次一起吃的饭让你印象最深？' },
  { id: '22222222-2222-4222-8222-222222222203', category: 'memory', content: '我们之间哪件小事，你现在想起来还会笑？' },
  { id: '22222222-2222-4222-8222-222222222204', category: 'memory', content: '哪一次旅行（或出门）最想再来一次？' },
  { id: '22222222-2222-4222-8222-222222222205', category: 'memory', content: '你记忆里我们最狼狈但最好笑的瞬间是什么？' },
  { id: '22222222-2222-4222-8222-222222222206', category: 'memory', content: '第一次说「我喜欢你」之前，你在想什么？' },
  // 未来
  { id: '33333333-3333-4333-8333-333333333301', category: 'future', content: '想一起去的下一座城市是哪里？为什么是它？' },
  { id: '33333333-3333-4333-8333-333333333302', category: 'future', content: '三年后的一个普通傍晚，你希望我们在做什么？' },
  { id: '33333333-3333-4333-8333-333333333303', category: 'future', content: '有什么想一起养成的小习惯？' },
  { id: '33333333-3333-4333-8333-333333333304', category: 'future', content: '想一起学的一样新东西是什么？' },
  { id: '33333333-3333-4333-8333-333333333305', category: 'future', content: '如果将来养一只小动物，你希望是什么？叫什么名字？' },
  { id: '33333333-3333-4333-8333-333333333306', category: 'future', content: '下一个想一起庆祝的小日子是什么？' },
  // 认识彼此
  { id: '44444444-4444-4444-8444-444444444401', category: 'know', content: '哪一件小事会让你感到被珍惜？' },
  { id: '44444444-4444-4444-8444-444444444402', category: 'know', content: '心情不好的时候，你更希望被怎样安慰？' },
  { id: '44444444-4444-4444-8444-444444444403', category: 'know', content: '你最近在担心什么？（不想说也可以写「暂不分享」）' },
  { id: '44444444-4444-4444-8444-444444444404', category: 'know', content: '对方做过什么让你特别感动但没说出口的事？' },
  { id: '44444444-4444-4444-8444-444444444405', category: 'know', content: '如果用一种季节形容我们的关系，会是什么季节？' },
  { id: '44444444-4444-4444-8444-444444444406', category: 'know', content: '你希望我更常做的一件小事是什么？' },
]

/** 随机挑一题（可排除近期用过的题） */
export function pickQuestion(category: QuizCategory | 'all' = 'all', excludeIds: readonly string[] = []): QuizQuestion {
  const pool = QUESTION_BANK.filter(
    (q) => (category === 'all' || q.category === category) && !excludeIds.includes(q.id),
  )
  const source = pool.length > 0 ? pool : QUESTION_BANK.filter((q) => category === 'all' || q.category === category)
  return source[Math.floor(Math.random() * source.length)]!
}

export function questionById(id: string): QuizQuestion | undefined {
  return QUESTION_BANK.find((q) => q.id === id)
}
