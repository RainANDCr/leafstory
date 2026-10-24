# 数据模型（DATA_MODEL）

> 迁移文件位于 `supabase/migrations/`，只做增量演进，不修改历史迁移。

## 当前（阶段 2 · 迁移 00001–00003）

### profiles — 用户档案

| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid PK → auth.users | 与认证用户一一对应；注册时由触发器 `handle_new_user` 自动创建 |
| nickname | text 默认 `'旅人'` | 用户可改；「猴子大王/追落叶」仅作文案示例 |
| avatar_url | text? | 阶段 1 未启用头像上传 |
| timezone | text 默认 `Asia/Shanghai` | 展示时刻按此时区换算（设置页可改） |
| created_at / updated_at | timestamptz | 审计字段 |

RLS：本人可读写；配对后伴侣可读（`private.is_partner`）。

### couples — 双人空间（00001）

display_name / created_at。RLS：有效成员可读。

### couple_members — 成员关系（00001）

couple_id FK、user_id FK（**unique**：一人同时只属一个空间）、role（founder/member）、joined_at。「空间最多 2 人」由入组 RPC 在事务中保证。RLS：有效成员可读。

### couple_invitations — 邀请码（00002）

| 列 | 类型 | 说明 |
|---|---|---|
| couple_id | uuid FK | 目标空间 |
| token_hash | text unique | 邀请码的 SHA-256（**不存明文**） |
| expires_at | timestamptz | 创建后 24 小时 |
| used_at / used_by | timestamptz? / uuid? | 一次性标记与使用者 |
| created_by | uuid FK | 创建者 |

RLS：已启用、无策略（客户端全拒，仅经 RPC 操作）。

### diary_entries — 日记（00002）

| 列 | 类型 | 说明 |
|---|---|---|
| couple_id / author_id | uuid FK | 所属空间 / 作者 |
| title ≤120 / content ≤20000 | text | 标题可空（显示「无题」） |
| happened_on | date | 发生的本地日历日（前端 yyyy-mm-dd） |
| mood | text enum | joy / date_trip / memorial / new_start / heartbeat / growth（用户手选） |
| category | text? ≤30 | 分类标签 |
| visibility | text enum | shared（默认）/ private |
| status | text enum | published（默认）/ draft |
| created_at / updated_at | timestamptz | 审计 |

索引：(couple_id, happened_on desc, created_at desc)、(author_id)。
RLS：select = 作者本人 ∪（shared ∧ published ∧ 空间有效成员）；insert 需为成员且 author 为本人；update/delete 仅作者。

### diary_media — 日记照片元数据（00002）

diary_entry_id FK（级联删除）、storage_path、file_name、mime_type、size_bytes、position、uploaded_by。
RLS：可见性跟随所属日记（作者全可见；伴侣仅共享已发布日记的媒体）；插入/删除需为日记作者。文件本体在私有桶 `diary-media`，路径 `couple/{couple_id}/diary/{entry_id}/{uuid}.jpg`，桶策略限定空间成员。

### anniversaries — 纪念日（00002）

| 列 | 类型 | 说明 |
|---|---|---|
| couple_id | uuid FK | 所属空间 |
| title ≤60 | text | 名称 |
| kind | text enum | met / together / birthday / first_date / custom（前三类为金叶） |
| anniversary_date | date | 本地日历日（DATE 语义） |
| repeats_yearly | boolean | 每年重复（默认）/ 一次性 |
| note ≤500 | text? | 备注 |
| linked_diary_id | uuid FK? | 关联日记（删除日记置空） |
| created_by | uuid FK | 创建者 |

RLS：空间有效成员可读可写。

### story_books — 自定义专题（00003）

title ≤60、intro ≤500?、cover_mood（六心情色之一）、position（排序）、created_by。RLS：空间成员可读写；updated_at 触发器。
月度/年度章节为**虚拟聚合**（查询侧按 happened_on 分组），不落库。

### story_book_items — 专题条目（00003）

story_book_id FK（级联删）、diary_entry_id FK（**on delete cascade：日记删除条目自动移除**）、position、added_by；`unique(story_book_id, diary_entry_id)`。
RLS：所属专题的空间成员可读；插入额外校验日记与专题属同一空间。日记被改为私密时条目保留，读取侧按日记可见性解析为「占位」。

### RPC（00002，均为 SECURITY DEFINER，search_path=''，仅 authenticated 可执行）

- `create_couple_space(display_name)` → 创建空间 + founder 入组 + 生成邀请码（返回明文一次）
- `create_couple_invitation()` → 待配对时重新生成（旧码作废）
- `get_my_couple_invitation()` → 待用邀请元数据（不含明文码）
- `join_couple_with_code(code)` → 事务内验哈希 → 锁空间 → 人数上限 → 入组 → 作废邀请

## 规划（随阶段以增量迁移落地）

| 阶段 | 新增表 |
|---|---|
| 2 | story_books、story_book_items |
| 3 | wishes、wish_events、wish_diary_links、letters + letter_contents + letter_media（封套与正文分离，未到期正文不可读） |
| 4 | places、diary_place_links、question_bank、question_sessions、question_answers、question_favorites |
| 5 | （可选）AI 采纳结果；不保存完整 prompt / Key |
| 6 | 年度金叶（golden_leaves 或等价聚合） |

## 时间语义约定

- 时刻（created_at、解锁时间）：`timestamptz`，存 UTC，展示按 profiles.timezone。
- 日历日（纪念日、日记发生日期）：`DATE`，对应前端本地 `yyyy-mm-dd` 字符串；工具 `src/lib/dates.ts` 统一解析（含 2/29 收敛），避免 UTC 跨天误差。
