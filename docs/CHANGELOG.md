# 变更日志（CHANGELOG）

格式参考 keepachangelog.com；阶段号与《落叶物语全阶段开发提示词》一致。

## [0.1.0] · 阶段 0 —— 项目初始化与架构搭建（2026-10-24）

### 新增

- 工程：Vite + React 19 + TypeScript（strict）+ Tailwind CSS v4 + React Router 7 + TanStack Query 5；ESLint、Vitest、测试脚本齐备。
- 设计系统：纸张米白/树皮深棕/落叶金/森林绿令牌（`src/styles/tokens.css`）、纸张颗粒质感、衬线标题、统一焦点环、`prefers-reduced-motion` 降级。
- 应用外壳：移动端「顶栏 + 五项底部导航（安全区适配）」与桌面侧栏；未配置 Supabase 时的诚实提示横幅。
- 页面骨架：森林（占位回忆树 + 小猴守护者 + 今日提示 + 空状态）、日记、故事、互动、足迹、设置、登录、配对、404。
- 原创素材：回忆之树 SVG（四季配色）、小猴守护者 SVG、全套线性图标、落叶 favicon。
- 基础设施：Supabase 客户端（未配置返回 null）、文案集中管理（i18n 预留多语言）、日期工具（本地日历日/UTC 语义）、错误规范化、平台适配层（通知接口，Web 空实现）。
- 数据库迁移 00001：profiles / couples / couple_members（全表 RLS，保守策略）+ 私有桶 diary-media。
- 文档：PROJECT_BRIEF / ARCHITECTURE / DATA_MODEL / SECURITY / README。

### 已知限制（留待后续阶段）

- 无认证与配对（阶段 1）；树为占位、叶片不可点击（阶段 2 接真实数据）。
- 深色模式未实现（规划随偏好设置阶段落地）；E2E 测试未引入（阶段 7）。
- 移动端视觉仅按常见宽度自检，未经真机回归。
