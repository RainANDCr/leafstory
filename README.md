# 落叶物语 · 猴子大王与追落叶的恋爱日记

> 把今天留在一片叶子里。
> 两个人的私密恋爱日记：每篇日记化作一片叶子，回忆沉淀成故事书，
> 一只小猴子守护着你们的记忆。

**当前进度：阶段 0（项目初始化与架构搭建）已完成。**
路线：0 骨架 → 1 账户/日记/纪念日 → 2 树+故事书 → 3 心愿瓶+时光邮局 → 4 地图+问答 → 5 AI（BYOK）→ 6 年度金叶+导出 → 7 部署+Android APK → 8（可选）Windows。

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

未配置 Supabase 时应用照常运行：展示界面骨架，并在顶部明确提示「数据不会保存」。

## 配置 Supabase（连接真实数据库）

1. 在 [supabase.com](https://supabase.com) 创建项目（免费档即可）。
2. 打开 **Dashboard → SQL Editor**，执行 `supabase/migrations/00001_init_profiles_and_couples.sql`
   （或使用 Supabase CLI：`supabase db push`）。
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

> ⚠️ 只使用 anon public key。**任何情况下都不要**把 `service_role` key 放进前端或提交到仓库。

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

## 下一阶段（阶段 1）预告

双人账户（注册/登录/配对邀请码）、恋爱日记（文字/照片/心情/可见范围）、纪念日（倒计时/金叶），首页树简版接入真实数据。执行方式：将《全阶段开发提示词》中「阶段 1」整段交给开发代理。
