-- ============================================================
-- 00003 · 阶段 2：恋爱故事书（自定义专题）
--
-- 设计要点：
--   1. 月度/年度章节是「虚拟章节」：按日记日期在查询侧聚合，
--      不落库、不复制原始日记内容，日记一改章节即同步。
--   2. 自定义专题落库：story_books + story_book_items；
--      items 引用 diary_entries（on delete cascade）——日记被删除后
--      专题条目自动移除（合理同步）；日记被改为私密时不级联，
--      由读取侧按可见性解析并显示占位，不泄露内容。
--   3. 全表 RLS：仅双人空间有效成员可读写本空间的专题。
-- ============================================================

create table if not exists public.story_books (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples (id) on delete cascade,
  title      text not null check (char_length(title) <= 60),
  intro      text check (intro is null or char_length(intro) <= 500),
  cover_mood text check (cover_mood in ('joy','date_trip','memorial','new_start','heartbeat','growth')),
  position   integer not null default 0,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists story_books_couple_pos_idx on public.story_books (couple_id, position);

comment on table public.story_books is '自定义专题故事书；月度/年度章节为虚拟聚合不落库';

alter table public.story_books enable row level security;

drop policy if exists "story_books_member_select" on public.story_books;
create policy "story_books_member_select"
  on public.story_books for select to authenticated
  using (private.is_active_couple_member(couple_id));

drop policy if exists "story_books_member_insert" on public.story_books;
create policy "story_books_member_insert"
  on public.story_books for insert to authenticated
  with check (
    created_by = auth.uid()
    and private.is_active_couple_member(couple_id)
  );

drop policy if exists "story_books_member_update" on public.story_books;
create policy "story_books_member_update"
  on public.story_books for update to authenticated
  using (private.is_active_couple_member(couple_id))
  with check (private.is_active_couple_member(couple_id));

drop policy if exists "story_books_member_delete" on public.story_books;
create policy "story_books_member_delete"
  on public.story_books for delete to authenticated
  using (private.is_active_couple_member(couple_id));

drop trigger if exists story_books_touch_updated_at on public.story_books;
create trigger story_books_touch_updated_at
  before update on public.story_books
  for each row execute function public.touch_updated_at();

-- ---------- 专题条目：引用日记，删除日记自动移除 ----------

create table if not exists public.story_book_items (
  id             uuid primary key default gen_random_uuid(),
  story_book_id  uuid not null references public.story_books (id) on delete cascade,
  diary_entry_id uuid not null references public.diary_entries (id) on delete cascade,
  position       integer not null default 0,
  added_by       uuid not null references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now(),
  unique (story_book_id, diary_entry_id)
);

create index if not exists story_book_items_book_idx on public.story_book_items (story_book_id);

alter table public.story_book_items enable row level security;

-- 可读：所属专题的空间成员（内容可见性由读取日记时的 RLS 单独把关）
drop policy if exists "story_items_member_select" on public.story_book_items;
create policy "story_items_member_select"
  on public.story_book_items for select to authenticated
  using (
    exists (
      select 1 from public.story_books sb
      where sb.id = story_book_items.story_book_id
        and private.is_active_couple_member(sb.couple_id)
    )
  );

-- 可写：空间成员，且引用的日记必须属于同一空间
drop policy if exists "story_items_member_insert" on public.story_book_items;
create policy "story_items_member_insert"
  on public.story_book_items for insert to authenticated
  with check (
    added_by = auth.uid()
    and exists (
      select 1 from public.story_books sb
      where sb.id = story_book_items.story_book_id
        and private.is_active_couple_member(sb.couple_id)
    )
    and exists (
      select 1 from public.diary_entries de
      where de.id = story_book_items.diary_entry_id
        and de.couple_id = (select couple_id from public.story_books where id = story_book_id)
    )
  );

drop policy if exists "story_items_member_delete" on public.story_book_items;
create policy "story_items_member_delete"
  on public.story_book_items for delete to authenticated
  using (
    exists (
      select 1 from public.story_books sb
      where sb.id = story_book_items.story_book_id
        and private.is_active_couple_member(sb.couple_id)
    )
  );
