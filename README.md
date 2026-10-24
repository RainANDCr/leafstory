# 落叶物语 · 猴子大王与追落叶的恋爱日记

> 把今天留在一片叶子里。
> 两个人的私密恋爱日记：每篇日记化作一片叶子，回忆沉淀成故事书，
> 一只小猴子守护着你们的记忆。

**当前进度：阶段 0–7 全部完成（Windows EXE 可选阶段 8 未做）。**
路线：0 骨架 ✅ → 1 账户/日记/纪念日 ✅ → 2 树+故事书 ✅ → 3 心愿瓶+时光邮局 ✅ → 4 地图+问答 ✅ → 5 AI（BYOK）✅ → 6 年度金叶+导出+数据管理 ✅ → 7 测试+部署+Android ✅ → 8（可选）Windows。

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发服务器 |
| `npm run build` | 类型检查 + 生产构建（输出 `dist/`） |
| `npm run preview` | 本地预览生产构建 |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript 严格检查 |
| `npm run test` | Vitest 单元测试（18 文件 101 用例） |
| `npm run test:e2e` | Playwright E2E（本地模式关键路径） |
| `npx cap sync android` | 同步 Web 构建到 Android 工程（见 docs/ANDROID_BUILD.md） |

## 技术栈

React 19 + TypeScript（strict）+ Vite · Tailwind CSS v4 · React Router 7 · TanStack Query 5 · Supabase（Auth / PostgreSQL / Storage，全表 RLS）· Vitest · （阶段 7）Capacitor 打包 Android。

## 环境要求

- Node.js ≥ 20.19（建议 22 或 24 LTS）
- npm ≥ 10

## 快速开始

```bash
npm install          # 安装依赖
npm run dev          # 启动开发服务器（默认 http://localhost:5173）
```

**不配置任何服务也能直接用（本地模式）**：注册、登录、配对、写日记、传照片、记纪念日全部可用——数据只保存在这台设备的浏览器里（文字在 localStorage、照片在 IndexedDB），不上传服务器。两人可以在同一台设备上各自登录使用（设置页可退出切换账号）。

> ⚠️ 本地模式须知：清除浏览器站点数据会一并删除所有记录；换浏览器/换设备数据不跟随；「忘记密码」不支持邮件找回。想两台设备同步使用时，再按下面的步骤配置 Supabase。

## 配置 Supabase（可选：转为云端双人同步）

本地模式适合一台设备上试用；想让两台设备登录同一份数据时，再配置云端：

1. 在 [supabase.com](https://supabase.com) 创建项目（免费档即可）。
2. 打开 **Dashboard → SQL Editor**，**按顺序**执行两个迁移文件：
   - `supabase/migrations/00001_init_profiles_and_couples.sql`
   - `supabase/migrations/00002_stage1_diary_anniversaries_pairing.sql`
3. 复制环境变量模板并填入：

   ```bash
   cp .env.example .env      # Windows: copy .env.example .env
   ```

   在 [Dashboard → Project Settings → API] 中取值填入：

   | 变量 | 说明 |
   |---|---|
   | `VITE_SUPABASE_URL` | 项目 URL（`https://xxxx.supabase.co`） |
   | `VITE_SUPABASE_ANON_KEY` | anon public key（可公开的客户端 Key） |

4. 重启 `npm run dev`，顶部横幅消失、设置页显示「已连接 Supabase」。
5. 建议在 **Dashboard → Authentication → Providers** 确认 Email 已启用；开发期可在 **Authentication → Sign In / Up** 关闭「Confirm email」省去查收邮件（正式使用再打开）。

> ⚠️ 只使用 anon public key。**任何情况下都不要**把 `service_role` key 放进前端或提交到仓库。

## 两个人的使用流程（阶段 1）

1. 各自用邮箱注册（登录页 →「注册」页签）。
2. 一人「配对」页 → 创建二人空间 → 复制 12 位邀请码发给对方（24 小时内有效、只能用一次）。
3. 另一人「配对」页 → 输入邀请码加入。
4. 「日记」页写日记：选心情（决定叶子颜色）、可加照片、默认双方可见（也可仅自己可见/存草稿）。
5. 「森林」首页看回忆之树长出叶子；「足迹」页添加纪念日看倒计时。

## 常用命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发服务器 |
| `npm run build` | 类型检查 + 生产构建（输出 `dist/`） |
| `npm run preview` | 本地预览生产构建 |
| `npm run lint` | ESLint 检查 |
| `npm run typecheck` | TypeScript 严格类型检查 |
| `npm run test` | Vitest 单元测试 |

## 目录速览

```
src/app        入口、路由、Provider、页面外壳
src/pages      森林 / 日记 / 故事 / 互动 / 足迹 / 设置 / 登录 / 配对
src/components 通用 UI、反馈态、导航、小猴角色
src/features   按领域拆分的业务模块（随阶段增长）
src/lib        Supabase 客户端、env、日期、错误工具
src/services   业务数据访问层（唯一直接调 Supabase 的层）
src/platform   Web/Android 平台适配层
supabase/      版本化迁移与 Edge Functions
docs/          PROJECT_BRIEF / ARCHITECTURE / DATA_MODEL / SECURITY / CHANGELOG
```

## 隐私红线

双人私密空间：无公开动态、无陌生人推荐、无广告追踪；定位默认关闭；
所有业务表启用 RLS；AI 功能严格可选（BYOK，发送前必须确认）。
详见 [docs/SECURITY.md](docs/SECURITY.md)。

## AI 故事编辑师（BYOK，完全可选）

在日记详情页或专题阅读页点「✨ AI 润色 / AI 整理」使用。**不配置 AI，其他一切功能照常。**

- **自备 Key**：在「设置 → AI」填入任意 OpenAI 兼容服务的接口地址（如 `https://api.openai.com/v1`）、模型名和 API Key。Key **只保存在当前页面内存**：不写本地存储、不进 URL、不打日志；刷新后需重新输入。
- **演示模式**：设置里勾选「演示模式」即可不联网走通全流程（选素材 → 预览 → 对照 → 存草稿），结果为本地拼装、明确标注「演示」。
- **发送什么由你决定**：每次逐篇勾选日记（默认全不选），确认前可预览**将发送的完整文字**；照片、地点、未勾选的内容绝不发送；只有你本人可见的日记才会出现在候选里。
- **费用与隐私告知**：发送前会明确提示「内容将发送给你配置的第三方模型服务，可能产生费用」，点「确认并发送」才会发起请求。
- **结果永远不覆盖原文**：原文/建议左右对照，可重新生成、复制、或经二次确认「存为新草稿」（草稿仅你可见，原始日记不动）。
- **提示词内置防捏造约束**：以你的日记为唯一事实来源，禁止虚构事件、日期与心理活动；素材不足时保持朴素。
- **服务端中转（可选）**：`supabase/functions/ai-polish` 提供带主机白名单（防 SSRF）、体积/超时限制、零日志的中转实现；部署后把地址填入环境变量 `VITE_AI_PROXY_URL` 即走中转，不部署则浏览器直连你自己的服务。

常用服务商（OpenAI 兼容端点）：OpenAI、OpenRouter、DeepSeek、Moonshot、阿里云百炼、SiliconFlow。费用与数据政策以各服务商为准。

## 部署与打包

- **网站**：`vercel.json` 与 `public/_redirects` 已就绪，步骤见 [docs/WEB_DEPLOYMENT.md](docs/WEB_DEPLOYMENT.md)（Vercel / Cloudflare Pages）。
- **Android APK**：`android/` 工程已生成（app.leafstory.diary），在装有 Android Studio 的电脑上按 [docs/ANDROID_BUILD.md](docs/ANDROID_BUILD.md) 构建；本仓库未实际打包（本机无 Android SDK，如实说明）。
- **发布前逐项核对**：[docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)（含可直接使用的隐私声明）。
