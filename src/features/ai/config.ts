/** AI 文风与参数预设（确定性常量，不调用任何服务） */

export const AI_STYLES = [
  { key: 'prose', label: '温柔散文' },
  { key: 'fairy', label: '童话叙事' },
  { key: 'letter', label: '书信口吻' },
  { key: 'narrator', label: '电影旁白' },
  { key: 'tidy', label: '精简整理' },
] as const

export type AiStyleKey = (typeof AI_STYLES)[number]['key']

export const AI_LENGTHS = [
  { key: 'short', label: '简短' },
  { key: 'medium', label: '适中' },
  { key: 'long', label: '充分' },
] as const

export type AiLengthKey = (typeof AI_LENGTHS)[number]['key']

export interface AiOptions {
  style: AiStyleKey
  length: AiLengthKey
  /** 尽量保留原句，不做无谓改写 */
  keepOriginal: boolean
  /** 突出叶子 / 森林 / 季节的意象 */
  leafImagery: boolean
}

export const DEFAULT_AI_OPTIONS: AiOptions = {
  style: 'prose',
  length: 'medium',
  keepOriginal: true,
  leafImagery: false,
}

export function styleLabel(key: AiStyleKey): string {
  return AI_STYLES.find((s) => s.key === key)?.label ?? key
}

export function lengthLabel(key: AiLengthKey): string {
  return AI_LENGTHS.find((l) => l.key === key)?.label ?? key
}

export function styleInstruction(key: AiStyleKey): string {
  switch (key) {
    case 'prose':
      return '以温柔克制的散文笔触重写，句子舒缓，情感不夸张。'
    case 'fairy':
      return '以温暖的绘本/童话口吻重写，可以带一点想象的光泽，但不添加未发生的事件。'
    case 'letter':
      return '以写信给恋人的口吻重写，亲切自然，落款不虚构人名与日期。'
    case 'narrator':
      return '以电影旁白的口吻重写，画面感强，节奏克制。'
    case 'tidy':
      return '做精简整理：理顺时间与结构，删去重复，保留所有真实细节，不扩写。'
  }
}

export function lengthInstruction(key: AiLengthKey): string {
  switch (key) {
    case 'short':
      return '篇幅简短：不超过素材总字数的一半。'
    case 'medium':
      return '篇幅适中：与素材大体相当。'
    case 'long':
      return '篇幅充分：可以舒展开来，但不得添加素材之外的事实。'
  }
}
