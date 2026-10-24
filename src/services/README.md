# services —— 业务数据访问层

这一层负责所有与 Supabase 的数据交互（查询、变更、RPC、Storage），
向上以函数形式暴露给 TanStack Query 使用；UI 组件不直接调用 Supabase 客户端。

约定（自阶段 1 起生效）：

- 每个领域一个文件：`diaryService.ts`、`anniversaryService.ts`、`wishService.ts` …
- 返回值使用明确的领域类型（定义在 `src/features/<领域>/types.ts`）。
- 服务层负责把 Supabase 错误包装成 `AppError`（见 `src/lib/errors.ts`）。
- 分页查询必须接受页码/每页数量参数，禁止无限加载。
- 涉及权限的操作一律依赖数据库 RLS 与安全 RPC，不在前端做权限判断。

阶段 0 尚无业务表数据访问，此目录仅保留约定说明。
