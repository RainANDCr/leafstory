/**
 * 阶段 7 E2E：本地模式关键路径回归（手机宽度视口）。
 * 覆盖：注册 → 配对（邀请码）→ 写日记 → 树叶反馈 → 纪念日 →
 * 月度故事章节 → 心愿完成 → 时光邮局封存（未到期不可开）→ 设置导出入口。
 * 隐私抽查：B 看不到 A 的私密日记；未到期信件无开启按钮。
 */
import { expect, test } from '@playwright/test'

const A = { email: 'e2e-a@test.local', password: 'leaf-e2e-123', nick: '猴子大王E2E' }
const B = { email: 'e2e-b@test.local', password: 'leaf-e2e-123', nick: '追落叶E2E' }

async function register(page: import('@playwright/test').Page, who: typeof A) {
  await page.goto('/login')
  await page.getByRole('tab', { name: '注册' }).click()
  await page.getByLabel('邮箱').fill(who.email)
  await page.getByLabel('昵称').fill(who.nick)
  await page.getByLabel('密码', { exact: false }).first().fill(who.password)
  await page.getByRole('button', { name: '注册', exact: true }).click()
  await page.waitForURL('**/forest')
}

async function signOutAndLogin(page: import('@playwright/test').Page, who: typeof A) {
  await page.goto('/settings')
  await page.getByRole('button', { name: '退出登录' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: '退出登录' }).click()
  await page.waitForURL('**/login')
  await page.getByLabel('邮箱').fill(who.email)
  await page.getByLabel('密码', { exact: false }).first().fill(who.password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL('**/forest')
}

test('本地模式：注册 → 配对 → 日记 → 树 → 纪念日 → 故事 → 心愿 → 信 → 隐私抽查', async ({ page }) => {
  // 1. A 注册并创建空间
  await register(page, A)
  await page.getByRole('button', { name: '去配对' }).first().click()
  await page.waitForURL('**/pairing')
  await page.getByRole('button', { name: /创建并生成邀请码/ }).click()
  const codeEl = page.locator('code').first()
  await expect(codeEl).toBeVisible()
  const inviteCode = (await codeEl.textContent())?.trim() ?? ''
  expect(inviteCode).toMatch(/^[0-9A-F]{12}$/)

  // 2. B 注册并凭码加入
  await signOutAndLogin(page, A) // 先回到登录页路径
  await page.goto('/login')
  await page.getByRole('tab', { name: '注册' }).click()
  await page.getByLabel('邮箱').fill(B.email)
  await page.getByLabel('昵称').fill(B.nick)
  await page.getByLabel('密码', { exact: false }).first().fill(B.password)
  await page.getByRole('button', { name: '注册', exact: true }).click()
  await page.waitForURL('**/forest')
  await page.goto('/pairing')
  await page.getByLabel('邀请码').fill(inviteCode)
  await page.getByRole('button', { name: '加入空间' }).click()
  await expect(page.getByText('已配对')).toBeVisible()

  // 3. B 写共享日记 + A 的私密日记稍后由 A 写；先写共享
  await page.goto('/diary/new')
  await page.getByLabel('正文').fill('今天一起在堤上看海，浪很大，风很轻。')
  await page.getByRole('button', { name: '发布' }).click()
  await page.waitForURL('**/forest')
  await expect(page.getByText('树上长出了一片新叶子')).toBeVisible()

  // 4. 纪念日
  await page.goto('/footprints')
  await page.getByRole('tab', { name: '纪念日' }).click()
  await page.getByRole('button', { name: '添加纪念日' }).click()
  await page.getByLabel('名称').fill('在一起')
  await page.getByLabel('类型').selectOption('together')
  await page.getByLabel('日期').fill('2024-05-20')
  await page.getByRole('dialog').getByRole('button', { name: '保存' }).click()
  await expect(page.getByText('在一起').first()).toBeVisible()

  // 5. 月度故事章节可翻开
  await page.goto('/story')
  await page.getByRole('link', { name: /月/ }).first().click()
  await expect(page.getByRole('heading', { name: /年 \d+ 月/ })).toBeVisible()

  // 6. 心愿：创建并完成（落叶动效提示）
  await page.goto('/interact')
  await page.getByRole('button', { name: '许一个愿' }).first().click()
  await page.getByLabel('心愿').fill('一起看一次日出')
  await page.getByRole('dialog').getByRole('button', { name: '保存' }).click()
  await page.getByRole('button', { name: '完成啦' }).click()
  await expect(page.getByText('愿望成真，落进回忆里')).toBeVisible({ timeout: 8_000 })

  // 7. 时光邮局：封存一封未来的信，收件人（A）应无「开启信件」按钮
  await page.getByRole('tab', { name: '时光邮局' }).click()
  await page.getByRole('button', { name: '写一封信' }).nth(1).click()
  await page.getByLabel('信的标题').fill('给明年的我们')
  await page.getByLabel('信的内容').fill('希望你们还在一起看落叶。')
  const soon = new Date(Date.now() + 3600_000)
  const pad = (n: number) => `${n}`.padStart(2, '0')
  const local = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}T${pad(soon.getHours())}:${pad(soon.getMinutes())}`
  await page.getByLabel('开启时间').fill(local)
  await page.getByRole('button', { name: '预览这封信' }).click()
  await page.getByRole('button', { name: '封存这封信' }).click()
  await expect(page.getByText('未到期').first()).toBeVisible()

  // 8. 换 A：看不到 B 未到期信的开启按钮；写一篇私密日记
  await signOutAndLogin(page, A)
  await page.goto('/interact')
  await page.getByRole('tab', { name: '时光邮局' }).click()
  await expect(page.getByRole('button', { name: '开启信件' })).toHaveCount(0)
  await page.goto('/diary/new')
  await page.getByLabel('正文').fill('这是 A 的悄悄话，只有我能看。')
  await page.getByRole('button', { name: '仅自己可见' }).click()
  await page.getByRole('button', { name: '发布' }).click()

  // 9. B 视角：看不到 A 的私密日记
  await signOutAndLogin(page, B)
  await page.goto('/diary')
  await expect(page.getByText('这是 A 的悄悄话')).toHaveCount(0)

  // 10. 设置页可见导出入口
  await page.goto('/settings')
  await expect(page.getByText('导出我的数据（JSON）')).toBeVisible()
})
