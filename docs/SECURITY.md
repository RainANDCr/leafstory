# 安全设计（SECURITY）

## 威胁模型

两位真实成员 A、B 之外，任何第三方 C（包括未认证访问者、注册了账号但未入组的人、试图直接调用 REST/RPC 的人）**不可读取任何双人空间数据**。成员之间也存在边界：仅自己可见的日记/草稿、未到期信件、未揭晓答案，另一方同样不可见。

## 行级安全（RLS）原则

1. 所有业务表启用 RLS，无例外；无策略 = 默认拒绝。
2. 权限判断只能发生在数据库/服务端（RLS、SECURITY DEFINER RPC、Edge Function）；**前端隐藏按钮、条件渲染均不构成权限**。
3. SECURITY DEFINER 函数：固定 `search_path = ''`、显式检查 `auth.uid()` 与双人空间归属、限制执行者；禁止泛读。
4. 共享内容按 `couple_id` 判定有效成员；私密内容额外限定 `auth.uid() = author_id`。
5. 邀请码：只存 token 哈希、短过期、一次性；入组在事务中检查空间人数上限（2），防止并发加进第三人。

## Storage

- 仅私有桶（`diary-media`，public=false）；不开放任何公读桶。
- 上传校验：类型、大小、数量限制在客户端预检 + 服务端强校验。
- 读取经短期签名 URL 或鉴权代理；删除需验证所有权；不留公开残链。

## 密钥纪律

- 前端只出现 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY`（anon public）。**service_role 永不进前端**，也不进 Git（`.gitignore` 已忽略 `.env*`）。
- 阶段 5 AI 的 BYOK Key：仅会话内短暂保留；不写 localStorage/URL/日志/Git/数据库；发送前必须用户显式确认。

## 隐私承诺

- 无公开动态、排行榜、陌生人推荐、第三方广告追踪。
- 定位默认关闭；地点由用户主动添加，默认城市级。
- 日志、报错、分析事件中不记录信件正文、日记内容或 Key。
- 地图瓦片请求可能暴露访问区域，需在隐私说明中披露并提供列表视图替代。

## 阶段 1 状态（迁移 00002 落地）

- **邀请码**：库中只存 SHA-256 哈希；24 小时有效、一次性；`join_couple_with_code` 在事务内「验哈希 → FOR UPDATE 锁空间 → 人数上限校验 → 入组 → 作废邀请」，并发下第三人无法加入。所有配对 RPC 仅 `authenticated` 可执行，固定 `search_path=''`。
- **日记**：select 策略 = 作者本人（含草稿/私密）∪（双方可见 ∧ 已发布 ∧ 空间有效成员）；update/delete 仅作者。媒体行可见性跟随所属日记。
- **纪念日**：双人空间有效成员可读写。
- **Storage**：私有桶 `diary-media` 路径级策略——`couple/{couple_id}/…` 前缀仅该空间有效成员可读/写/删；非法路径经 `private.storage_couple_id` 安全解析为 null（拒绝）。
- **帮助函数**：`private.is_active_couple_member` / `private.is_partner` / `private.storage_couple_id` 均为 SECURITY DEFINER + 固定 search_path，仅授权 `authenticated` 执行。
- **注册即建档案**：`handle_new_user` 触发器，避免依赖客户端补建。

### 已知限制（如实说明）

- 服务端 MIME 深度嗅探未实现（当前为客户端类型/大小校验 + 压缩转 JPEG + RLS 路径权限）；可在阶段 7 加 Edge Function 校验。
- 迁移与 RLS 尚未在真实 Supabase 项目验证（本机无项目）；上线前必须完成下面的三账号实测。

## 三账号隐私验收步骤（每阶段交付后执行）

前置：真实 Supabase 项目已按序执行 00001、00002 迁移；前端 `.env` 已配置。

1. **注册配对**：浏览器 A 注册账号 a@example.com；「配对」页创建空间，复制邀请码。浏览器 B（无痕窗口）注册 b@example.com，输入邀请码加入。
2. **共享与私密**：A 写两篇日记——一篇默认「双方可见」，一篇切「仅自己可见」，另存一篇草稿。B 的日记列表与森林树应只见共享篇；B 直接访问私密篇/草稿的 URL（可从 A 浏览器复制）应显示「这篇日记不存在，或你没有权限查看」。
3. **C 越权测试**：浏览器 C（第二个无痕窗口）注册 c@example.com：森林/日记/足迹均为空态（引导配对）；用 C 的登录态直接调 REST：
   ```bash
   curl -s "https://YOUR_PROJECT.supabase.co/rest/v1/diary_entries?select=id" \
     -H "apikey: <anon key>" -H "Authorization: Bearer <C 的 access token>"
   ```
   应返回 `[]`（RLS 过滤）。同理验证 `anniversaries`、`couple_members`、`storage/object/list`（应 403/空）。
4. **邀请码边界**：A 的邀请码被 B 使用后，C 再用同一码 →「邀请码无效或已过期」；把系统时间过后（或等待过期）再试 → 同样拒绝；A 重新生成后旧码立即失效。
5. **媒体权限**：B 打开 A 的共享日记能看到照片（签名 URL）；C 拿到同样的图片 URL 在新无痕窗口直接打开（签名过期后）应 400/403。
6. **纪念日**：B 添加「在一起」纪念日，A 可见且可编辑；C 不可见。

任一步不符合预期即视为阶段验收未通过，先修后进下一阶段。
