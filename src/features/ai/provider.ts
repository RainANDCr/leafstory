/**
 * OpenAI 兼容的模型调用适配器。
 *
 * 安全与克制：
 * - Key 只作为函数参数在内存中流转，绝不写 localStorage / URL / 日志；
 * - 默认从浏览器直连用户自己的服务（HTTPS）；若配置了中转地址
 *   （VITE_AI_PROXY_URL，指向自部署的 supabase/functions/ai-polish），
 *   则经中转发起，中转侧有主机白名单，防 SSRF；
 * - 60 秒超时；返回统一的错误文案（不含 Key 与请求全文）；
 * - mock=true 时完全不发起网络请求，返回本地拼装的结果（演示模式）。
 */

export interface AiCallParams {
  baseUrl: string
  apiKey: string
  model: string
  system: string
  user: string
  /** 中转地址（可选） */
  proxyUrl?: string
  /** 演示模式：不联网 */
  mock?: boolean
  /** 演示模式下的文风标签 */
  mockStyleLabel?: string
  signal?: AbortSignal
  /** 仅供测试注入 */
  fetchImpl?: typeof fetch
}

export class AiError extends Error {
  readonly kind: 'not_configured' | 'key_invalid' | 'rate_limited' | 'timeout' | 'aborted' | 'request_failed' | 'empty'

  constructor(kind: AiError['kind'], message: string) {
    super(message)
    this.name = 'AiError'
    this.kind = kind
  }
}

const TIMEOUT_MS = 60_000

export async function callAiModel(params: AiCallParams): Promise<string> {
  if (params.mock) {
    await new Promise((r) => setTimeout(r, 600))
    return mockResult(params.user, params.mockStyleLabel ?? '演示')
  }

  if (!params.baseUrl || !params.apiKey || !params.model) {
    throw new AiError('not_configured', 'AI 未配置')
  }

  const fetchImpl = params.fetchImpl ?? fetch
  const timeoutController = new AbortController()
  const timer = setTimeout(() => timeoutController.abort('timeout'), TIMEOUT_MS)
  const signal = params.signal
    ? anyOfSignals(params.signal, timeoutController.signal)
    : timeoutController.signal

  try {
    const target = params.proxyUrl
      ? params.proxyUrl
      : `${trimSlash(params.baseUrl)}/chat/completions`
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (params.proxyUrl) {
      headers['X-Target-Base-Url'] = trimSlash(params.baseUrl)
      headers['X-Api-Key'] = params.apiKey
    } else {
      headers['Authorization'] = `Bearer ${params.apiKey}`
    }

    const res = await fetchImpl(target, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        model: params.model,
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.user },
        ],
        temperature: 0.7,
        stream: false,
      }),
    })

    if (res.status === 401 || res.status === 403) throw new AiError('key_invalid', 'API Key 无效或未授权')
    if (res.status === 429) throw new AiError('rate_limited', '请求太频繁或额度不足')
    if (!res.ok) throw new AiError('request_failed', `服务返回 ${res.status}`)

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content?.trim()
    if (!content) throw new AiError('empty', '模型没有返回内容')
    return content
  } catch (err) {
    if (err instanceof AiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new AiError(signalAbortedByUser(params.signal) ? 'aborted' : 'timeout', '请求已中止')
    }
    throw new AiError('request_failed', '请求没有成功')
  } finally {
    clearTimeout(timer)
  }
}

function trimSlash(s: string): string {
  return s.replace(/\/+$/, '')
}

function signalAbortedByUser(userSignal?: AbortSignal): boolean {
  return Boolean(userSignal?.aborted)
}

function anyOfSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  if (a.aborted || b.aborted) controller.abort()
  a.addEventListener('abort', onAbort, { once: true })
  b.addEventListener('abort', onAbort, { once: true })
  return controller.signal
}

/** 演示模式：本地确定性的「润色」结果，让全流程（预览/对照/存稿）无需付费 Key 即可验证 */
function mockResult(userPrompt: string, styleLabel: string): string {
  const materials = userPrompt.split(/【日记｜/).slice(1)
  const lines: string[] = [`（${styleLabel}·演示模式生成——这不是真实的模型输出，只用于体验流程）`, '']
  for (const block of materials) {
    const meta = block.split('】')[0] ?? ''
    const body = (block.split('】')[1] ?? '').trim()
    const [, date, title] = meta.split('｜')
    const trimmed = body.length > 160 ? `${body.slice(0, 160)}…` : body
    lines.push(`${date ?? ''}，${title || '那一天'}：${trimmed}`)
    lines.push('')
  }
  lines.push('——如果这是真实的模型，这里会是一段按你选择的文风重写的文字。')
  return lines.join('\n')
}
