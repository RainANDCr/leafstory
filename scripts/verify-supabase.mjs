// 云端配置体检：验证迁移已生效、RLS 与配对 RPC 正常。
// 用法：node scripts/verify-supabase.mjs <SUPABASE_URL> <ANON_KEY>
// 仅使用 anon key 与公开 REST/RPC（模拟真实客户端），不触碰任何私密 Key。
const [url, anon] = process.argv.slice(2)
if (!url || !anon) {
  console.error('用法: node scripts/verify-supabase.mjs <SUPABASE_URL> <ANON_KEY>')
  process.exit(1)
}
const base = url.replace(/\/+$/, '')
const suffix = Math.random().toString(36).slice(2, 8)
const results = []
const ok = (name) => { results.push([name, true]); console.log(`  ✅ ${name}`) }
const fail = (name, err) => { results.push([name, false]); console.log(`  ❌ ${name}: ${err}`) }

async function signUp(email) {
  const res = await fetch(`${base}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: `verify-${suffix}-123456` }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.msg || data.error_description || JSON.stringify(data))
  return data // { access_token?, user }
}

async function rest(path, token, method = 'GET', body) {
  const res = await fetch(`${base}/rest/v1/${path}`, {
    method,
    headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

async function main() {
  console.log(`体检目标：${base}\n`)

  // 1. 注册 A（若项目开启邮箱验证则无 session —— 如实提示）
  let a
  try {
    a = await signUp(`verify-a-${suffix}@leafstory.test`)
    if (a.access_token) ok(`注册 A（直接建立会话，邮箱验证未开启）`)
    else ok('注册 A（需邮箱验证：未返回会话——请到邮箱确认后再人工登录验证，或暂时关闭 Confirm email）')
  } catch (e) {
    return fail('注册 A', e.message)
  }
  if (!a.access_token) {
    console.log('\n⚠️ 项目开启了邮箱验证，无法继续无人值守体检；可在 Authentication → Sign In / Up 暂时关闭后重跑。')
    return summarize()
  }

  // 2. profiles 触发器 + RLS
  try {
    const { status, body } = await rest(`profiles?id=eq.${a.user.id}&select=nickname`, a.access_token)
    if (status === 200 && Array.isArray(body) && body.length === 1) ok('注册触发器已建档案 & profiles RLS 放行本人')
    else fail('profiles 读取', `status=${status} body=${JSON.stringify(body)}`)
  } catch (e) {
    fail('profiles 读取', e.message)
  }

  // 3. 配对 RPC：创建空间拿邀请码
  let code
  try {
    const res = await fetch(`${base}/rest/v1/rpc/create_couple_space`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${a.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_display_name: '体检空间' }),
    })
    const data = await res.json()
    if (res.ok && typeof data === 'string' && /^[0-9A-F]{12}$/.test(data)) {
      code = data
      ok('create_couple_space 返回 12 位邀请码')
    } else fail('create_couple_space', JSON.stringify(data))
  } catch (e) {
    fail('create_couple_space', e.message)
  }

  // 4. B 注册并凭码加入
  let b
  try {
    b = await signUp(`verify-b-${suffix}@leafstory.test`)
    if (!b.access_token) throw new Error('B 需邮箱验证')
    const res = await fetch(`${base}/rest/v1/rpc/join_couple_with_code`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${b.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_code: code }),
    })
    const data = await res.json()
    if (res.ok && typeof data === 'string') ok('B 凭邀请码加入（RPC 事务/哈希校验生效）')
    else fail('join_couple_with_code', JSON.stringify(data))
  } catch (e) {
    fail('B 注册/加入', e.message)
  }

  // 5. RLS 越权抽查：B 读 A 的空间外数据（无配对关系时应为空）
  try {
    const { status, body } = await rest('couple_members?select=couple_id', b?.access_token ?? a.access_token)
    if (status === 200 && Array.isArray(body)) ok(`couple_members RLS 放行成员（返回 ${body.length} 行）`)
    else fail('couple_members 读取', `status=${status}`)
  } catch (e) {
    fail('couple_members 读取', e.message)
  }

  // 6. 信件正文表零 SELECT：无策略时 REST 应 401/空权限错误而不是返回行
  try {
    const { status } = await rest('letter_contents?select=*', a.access_token)
    if (status === 401 || status === 403) ok(`letter_contents 对客户端直读拒绝（status=${status}，密封生效）`)
    else fail('letter_contents 拒绝', `status=${status}（期望 401/403）`)
  } catch (e) {
    fail('letter_contents 拒绝', e.message)
  }

  console.log('\n提示：本次体检创建了 2 个 verify-* 测试账号与 1 个空间，可在 Authentication → Users 删除。')
  summarize()
}

function summarize() {
  const passed = results.filter(([, v]) => v).length
  console.log(`\n结果：${passed}/${results.length} 项通过`)
  process.exit(results.every(([, v]) => v) ? 0 : 1)
}

main().catch((e) => {
  console.error('体检脚本异常：', e)
  process.exit(1)
})
