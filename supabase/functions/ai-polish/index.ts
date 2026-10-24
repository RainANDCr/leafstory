// ============================================================
// ai-polish —— AI 故事编辑师的服务端中转（可选部署）
//
// 部署后把其地址配到前端 VITE_AI_PROXY_URL，模型请求即经此中转：
//   - 主机白名单，杜绝任意 baseURL（SSRF）；
//   - 只转发用户主动提交的 system/user 与其自己的 Key；
//   - 限制请求体大小与超时；
//   - 不记录 Key、不记录日记内容、不写任何日志字段。
// 不部署时前端默认从浏览器直连用户自己配置的服务（同样 HTTPS）。
//
// 部署：supabase functions deploy ai-polish
// ============================================================

const ALLOWED_HOSTS = new Set([
  'api.openai.com',
  'openrouter.ai',
  'api.deepseek.com',
  'api.moonshot.cn',
  'dashscope.aliyuncs.com',
  'api.siliconflow.cn',
])

const MAX_BODY_BYTES = 120_000
const TIMEOUT_MS = 60_000

interface ProxyPayload {
  model: string
  system: string
  user: string
}

Deno.serve(async (req) => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  try {
    if (req.method !== 'POST') return json(405, { error: 'method not allowed' })

    // 必须携带 Supabase JWT（登录用户），未授权一律拒绝
    const auth = req.headers.get('Authorization') ?? ''
    if (!auth.startsWith('Bearer ') || auth.length < 20) {
      return json(401, { error: 'unauthorized' })
    }

    const baseUrl = (req.headers.get('X-Target-Base-Url') ?? '').replace(/\/+$/, '')
    const apiKey = req.headers.get('X-Api-Key') ?? ''
    let target: URL
    try {
      target = new URL(`${baseUrl}/chat/completions`)
    } catch {
      return json(400, { error: 'invalid base url' })
    }
    if (target.protocol !== 'https:') return json(400, { error: 'https only' })
    if (!ALLOWED_HOSTS.has(target.hostname)) return json(400, { error: 'host not allowed' })
    if (!apiKey) return json(400, { error: 'missing api key' })

    const raw = await req.text()
    if (raw.length > MAX_BODY_BYTES) return json(413, { error: 'payload too large' })
    const payload = JSON.parse(raw) as ProxyPayload
    if (!payload?.model || !payload?.system || !payload?.user) {
      return json(400, { error: 'invalid payload' })
    }

    const upstream = await fetch(target.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: payload.model,
        messages: [
          { role: 'system', content: payload.system },
          { role: 'user', content: payload.user },
        ],
        temperature: 0.7,
        stream: false,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    // 透传响应体，不落任何日志
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return json(502, { error: 'upstream failed' })
  }
})
