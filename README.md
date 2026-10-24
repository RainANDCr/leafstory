# 落叶物语 · 猴子大王与追落叶的恋爱日记

> 把今天留在一片叶子里。
> 两个人的私密恋爱日记：每篇日记化作一片叶子，回忆沉淀成故事书，
> 一只小猴子守护着你们的记忆。

**当前进度：阶段 3（落叶心愿瓶 + 时光邮局）代码已完成，本地模式可直接体验。**
路线：0 骨架 ✅ → 1 账户/日记/纪念日 ✅ → 2 树+故事书 ✅ → 3 心愿瓶+时光邮局（已实现）→ 4 地图+问答 → 5 AI（BYOK）→ 6 年度金叶+导出 → 7 部署+Android APK → 8（可选）Windows。

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

## 下一阶段（阶段 4）预告

双人恋爱地图（Leaflet、地点关联日记、无自动追踪）与默契小问答（双方提交后揭晓、服务端防偷看）。执行方式：将《全阶段开发提示词》中「阶段 4」整段交给开发代理。
