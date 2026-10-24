/** 回忆树季节：按月份推算，仅影响外观配色，不影响数据 */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

export function seasonOf(date: Date = new Date()): Season {
  const month = date.getMonth() + 1
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'autumn'
  return 'winter'
}
