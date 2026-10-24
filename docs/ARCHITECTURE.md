# 架构说明（ARCHITECTURE）

## 技术栈（以 package.json 实际安装版本为准）

| 层 | 选择 | 说明 |
|---|---|---|
| 前端 | React 19 + TypeScript（strict）+ Vite | 单代码库，Web 与 Android 共用 |
| 样式 | Tailwind CSS v4（@theme 设计令牌） | 令牌集中 `src/styles/tokens.css` |
| 路由 | React Router v7（browser 路由） | 部署时需配置 SPA 回退 |
| 服务器状态 | TanStack Query v5 | 仅经 services 层访问数据 |
| 后端 | Supabase（Auth + PostgreSQL + Storage） | 全表 RLS；私密逻辑用 RPC / Edge Functions |
| 测试 | Vitest + Testing Library | E2E（Playwright）在阶段 7 引入 |
| 打包 | Capacitor（阶段 7） | 复用同一前端 |

## 目录结构

```
src/
  app/          应用入口、路由、Provider、页面外壳（AppLayout）
  pages/        路由页面：森林/日记/故事/互动/足迹/设置/登录/配对/404
  components/   通用 UI（Button/Card/PageHeader/EmptyState/…）、
                反馈态（Loading/Error）、布局（导航/横幅/图标）、小猴角色
  features/     按领域拆分的业务模块（阶段 1 起增长，如 forest/diary/story）
  lib/          Supabase 客户端、env 读取、日期、错误规范化
  services/     业务数据访问层（唯一允许直接调用 Supabase 的层）
  platform/     Web/Android 平台适配层（通知等能力收敛于此）
  styles/       设计令牌（tokens.css）与全局样式（global.css）
  i18n/         文案集中管理（zh-CN.ts），预留多语言口
  test/         测试 setup
supabase/
  migrations/   版本化 SQL 迁移（只增量，不改历史）
  functions/    Edge Functions（阶段 1 起使用）
docs/           项目文档
```

## 关键设计决定

1. **数据流向**：`组件 → services（领域函数） → Supabase`；组件不直接持有 Supabase 客户端，权限完全依赖 RLS 与安全 RPC，前端条件渲染不作为权限手段。
2. **未配置也可运行**：`lib/env.ts` 检测配置缺失时 `getSupabase()` 返回 null，UI 呈现骨架 + 明确的 SetupBanner，绝不假装已保存。
3. **时间语义**：时刻存 UTC（timestamptz）按用户时区展示；日历日用本地 `yyyy-mm-dd` 字符串（DATE 语义）。工具集中在 `lib/dates.ts`。
4. **平台差异**：浏览器/原生差异（通知、文件、返回键）一律经 `src/platform` 的 `PlatformAdapter` 接口；Android 实现在阶段 7 添加。
5. **季节外观**：回忆树颜色随本机月份变化，纯视觉层，不影响数据。
6. **文案集中**：所有界面文案经 `src/i18n`（`t('forest.title')` 风格），便于将来英文扩展。

## 阶段路线

阶段 0 骨架 → 阶段 1（当前）账户/配对/日记/纪念日 MVP（数据层 `src/services`，领域模块 `src/features/{auth,couple,diary,anniversaries,forest}`）→ 2 树+故事书 → 3 心愿瓶+时光邮局 → 4 地图+问答 → 5 AI（BYOK）→ 6 年度金叶+导出+数据管理 → 7 测试+部署+APK → 8（可选）Windows EXE。
