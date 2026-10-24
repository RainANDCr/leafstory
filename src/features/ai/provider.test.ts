import { describe, expect, it, vi } from 'vitest'
import { AiError, callAiModel } from './provider'

function okResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
}

const base = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'sk-test',
  model: 'gpt-4o-mini',
  system: 's',
  user: 'u',
}

describe('callAiModel', () => {
  it('演示模式不发起网络请求，返回拼装结果', async () => {
    const fetchImpl = vi.fn()
    const out = await callAiModel({ ...base, mock: true, mockStyleLabel: '温柔散文', fetchImpl })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(out).toContain('温柔散文·演示模式')
  })

  it('成功路径：解析 choices[0].message.content', async () => {
    const fetchImpl = vi.fn(async () => okResponse('  润色后的文字  '))
    const out = await callAiModel({ ...base, fetchImpl })
    expect(out).toBe('润色后的文字')
    // Key 走 Authorization 头，不进 URL
    const [url] = fetchImpl.mock.calls[0] as unknown as [string]
    expect(String(url)).not.toContain('sk-test')
  })

  it('错误映射：401→key_invalid、429→rate_limited、空结果→empty', async () => {
    await expect(
      callAiModel({ ...base, fetchImpl: vi.fn(async () => new Response('{}', { status: 401 })) }),
    ).rejects.toMatchObject({ kind: 'key_invalid' })
    await expect(
      callAiModel({ ...base, fetchImpl: vi.fn(async () => new Response('{}', { status: 429 })) }),
    ).rejects.toMatchObject({ kind: 'rate_limited' })
    await expect(
      callAiModel({ ...base, fetchImpl: vi.fn(async () => okResponse('   ')) }),
    ).rejects.toMatchObject({ kind: 'empty' })
  })

  it('未配置时抛 not_configured；用户取消 → aborted', async () => {
    await expect(callAiModel({ baseUrl: '', apiKey: '', model: '', system: 's', user: 'u' })).rejects.toMatchObject({
      kind: 'not_configured',
    })

    const controller = new AbortController()
    const promise = callAiModel({
      ...base,
      signal: controller.signal,
      fetchImpl: vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          }),
      ) as unknown as typeof fetch,
    })
    controller.abort()
    await expect(promise).rejects.toMatchObject({ kind: 'aborted' })
  })

  it('中转模式：目标地址与 Key 放在头部，不进 URL', async () => {
    const fetchImpl = vi.fn(async () => okResponse('ok'))
    await callAiModel({ ...base, proxyUrl: 'https://my-project.supabase.co/functions/v1/ai-polish', fetchImpl })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(String(url)).toContain('functions/v1/ai-polish')
    expect(String(url)).not.toContain('sk-test')
    const headers = init.headers as Record<string, string>
    expect(headers['X-Api-Key']).toBe('sk-test')
    expect(headers['X-Target-Base-Url']).toBe('https://api.openai.com/v1')
  })

  it('错误信息不包含 Key', async () => {
    try {
      await callAiModel({ ...base, fetchImpl: vi.fn(async () => new Response('{}', { status: 500 })) })
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(AiError)
      expect((err as Error).message).not.toContain('sk-test')
    }
  })
})
