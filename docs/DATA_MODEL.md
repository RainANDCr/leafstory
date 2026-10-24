# 数据模型（DATA_MODEL）

> 迁移文件位于 `supabase/migrations/`，只做增量演进，不修改历史迁移。

## 当前（阶段 0 · 迁移 00001）

### profiles — 用户档案

| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid PK → auth.users | 与认证用户一一对应 |
| nickname | text 默认 `'旅人'` | 用户可改；「猴子大王/追落叶」仅作文案示例 |
| avatar_url | text? | 阶段 1 接入头像 |
| timezone | text 默认 `Asia/Shanghai` | 展示时刻按此时区换算 |
| created_at / updated_at | timestamptz | 审计字段 |

RLS：仅本人 select/insert/update 自己的行；匿名拒绝。

### couples — 双人空间

| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| display_name | text? | 可选的空间名 |
| created_at | timestamptz | |

RLS：已启用但**无任何策略**（默认全拒）；阶段 1 由安全 RPC 操作。

### couple_members — 成员关系

| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| couple_id | uuid FK → couples | on delete cascade |
| user_id | uuid FK → auth.users | **unique**：一人同时只属一个空间 |
| role | text | founder（邀请创建者）/ member |
| joined_at | timestamptz | |

约束：`unique(couple_id, user_id)`、`unique(user_id)`、`couple_id` 索引。「空间最多 2 人」在阶段 1 的入组 RPC 中以事务检查保证。

### Storage

私有桶 `diary-media`（public=false，迁移中幂等创建），未来存放日记照片与信件附件；对象级策略随阶段 1 建立（仅空间成员可读写自己空间的路径，如 `couple/{couple_id}/…`）。

## 规划（随阶段以增量迁移落地）

| 阶段 | 新增表 |
|---|---|
| 1 | couple_invitations（token 哈希、过期、一次性）、diary_entries、diary_media、anniversaries（DATE 语义） |
| 2 | story_books、story_book_items |
| 3 | wishes、wish_events、wish_diary_links、letters + letter_contents + letter_media（封套与正文分离，未到期正文不可读） |
| 4 | places、diary_place_links、question_bank、question_sessions、question_answers、question_favorites |
| 5 | （可选）AI 采纳结果；不保存完整 prompt / Key |
| 6 | 年度金叶（golden_leaves 或等价聚合） |

## 时间语义约定

- 时刻（created_at、解锁时间）：`timestamptz`，存 UTC，展示按 profiles.timezone。
- 日历日（纪念日、日记发生日期）：`DATE`，对应前端本地 `yyyy-mm-dd` 字符串；工具 `src/lib/dates.ts` 统一解析，避免 UTC 跨天误差。
