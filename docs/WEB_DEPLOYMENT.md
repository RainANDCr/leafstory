# Web 部署指南（Vercel / Cloudflare Pages）

> 前提：仓库已推送到 GitHub（`git remote add origin … && git push -u origin main`）。
> 本文档只描述操作步骤；**在取得你的确认前，代理不会执行任何上线动作。**

## 0. 上线前必做（数据库侧）

1. Supabase → SQL Editor，**按顺序**执行全部迁移：
   `supabase/migrations/00001` → `00002` → `00003` → `00004` → `00005` → `00006`。
2. Authentication → URL Configuration：
   - Site URL：填你的正式域名（如 `https://leafstory.example.com`）
   - Redirect URLs：加入正式域名与 `http://localhost:5173/**`（本地开发）
3. Authentication → Sign In / Up：正式使用建议开启 **Confirm email**（开发期可关）。
4. Storage：确认存在**私有**桶 `diary-media`（00001 迁移已建，public 必须为 false）。
5. 复核 RLS：每张业务表 `Row Level Security` 均为 Enabled（SQL Editor 里
   `select tablename, rowsecurity from pg_tables where schemaname='public';`）。

## 1. 环境变量（构建时注入，均为可公开值）

| 变量 | 值 |
|---|---|
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | anon public key（**绝不是** service_role） |
| `VITE_AI_PROXY_URL` | 可选；部署了 `supabase/functions/ai-polish` 后填写其地址 |

不配置任何 Supabase 变量时，站点以**本地模式**运行（数据仅存访客设备浏览器）。

## 2. Vercel

1. [vercel.com](https://vercel.com) → Add New → Project → 导入 GitHub 仓库。
2. Framework Preset 自动识别为 Vite（仓库内 `vercel.json` 已含 SPA 回退 rewrite）。
3. Environment Variables 填上表变量（Production 与 Preview 都加）。
4. Deploy。后续每次 `git push` 自动部署；回滚在 Deployments → … → Promote 旧版本。

## 3. Cloudflare Pages

1. [pages.cloudflare.com](https://pages.cloudflare.com) → Create a project → Connect to Git。
2. Build command `npm run build`；Output directory `dist`（仓库内 `public/_redirects`
   提供 `/* → /index.html` 的 SPA 回退）。
3. Environment variables 同上（Production/Preview 分别设置）。
4. Save and Deploy；自定义域名在 Custom domains 里绑定（自动 HTTPS）。

## 4. 可选：AI 中转函数

```bash
supabase functions deploy ai-polish
# 然后把 https://<project>.supabase.co/functions/v1/ai-polish 填到 VITE_AI_PROXY_URL
```

## 5. 版本更新流程

1. 修改代码 → `npm run lint && npm run typecheck && npm run test && npm run build` 全绿。
2. 新增数据库变更**只能新增迁移文件**（00007、00008…），先在 Supabase SQL Editor 执行，再部署前端。
3. `git push` → 平台自动构建；出问题用平台自带回滚。
4. Android 侧：`npm run build && npx cap sync android` 后重新打包（见 docs/ANDROID_BUILD.md）。

## 6. 最小备份建议

- Supabase → Database → Backups：免费档保留 7 天；重要纪念日节点前用
  `supabase db dump`（CLI）导出一份到本地/私有网盘。
- 照片在 Storage：与数据库同项目，随项目备份策略走。
