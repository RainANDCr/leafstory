/**
 * AI 提示词构建（纯函数）：
 * 系统提示固定「以用户素材为唯一事实来源，禁止捏造」；
 * 用户提示逐篇拼接选中的日记文字——发送给模型的内容与预览完全一致。
 */

export interface AiMaterial {
  id: string
  title: string
  happenedOn: string
  content: string
}

/** 单篇素材与整体输入的字数上限（超长截断并明确标注，不做静默分块） */
export const MAX_ENTRY_CHARS = 12_000
export const MAX_TOTAL_CHARS = 30_000

export function buildSystemPrompt(): string {
  return [
    '你是《落叶物语》（一本两个人的恋爱日记）的故事编辑师，帮用户把真实日记润色成指定文风。',
    '必须遵守：',
    '1. 用户提供的日记是唯一事实来源：禁止虚构未出现的旅行、对话、事件、纪念日或人物心理。',
    '2. 不添加新的日期、地点或人物；不确定的事宁可省略，保持朴素，也不要编。',
    '3. 若用户要求保留原句，则只做必要的润饰与衔接，不无故改写。',
    '4. 使用自然、温暖的简体中文，避免夸张煽情。',
    '5. 只输出润色后的正文本身：不要解释、不要前后缀、不要 Markdown 代码块。',
  ].join('\n')
}

export function buildUserPrompt(
  materials: readonly AiMaterial[],
  options: { styleInstruction: string; lengthInstruction: string; keepOriginal: boolean; leafImagery: boolean },
): string {
  const parts: string[] = ['请把下面的日记素材润色重写。']
  parts.push(`文风要求：${options.styleInstruction}`)
  parts.push(`篇幅要求：${options.lengthInstruction}`)
  if (options.keepOriginal) parts.push('尽量保留原句，只做必要润饰。')
  if (options.leafImagery) parts.push('可以适度使用叶子、森林、季节的意象作为修辞（但不得虚构情节）。')
  parts.push('素材如下（均为用户真实日记）：')

  let total = 0
  for (const m of materials) {
    let content = m.content.slice(0, MAX_ENTRY_CHARS)
    if (m.content.length > MAX_ENTRY_CHARS) content += '\n（该篇过长，已截断）'
    const block = `【日记｜${m.happenedOn}｜${m.title || '无题'}】\n${content}`
    if (total + block.length > MAX_TOTAL_CHARS) {
      parts.push('（素材总长度已达上限，其余篇目未包含）')
      break
    }
    parts.push(block)
    total += block.length
  }
  return parts.join('\n\n')
}

/** 发送前的预览文本：与实际发给模型的用户提示完全一致 */
export function buildMaterialPreview(materials: readonly AiMaterial[], options: Parameters<typeof buildUserPrompt>[1]): string {
  return buildUserPrompt(materials, options)
}

/** 预计字数（不含系统提示） */
export function estimateChars(text: string): number {
  return text.length
}
