-- ============================================================
-- 《落叶物语》数据库一次性初始化脚本（= migrations/00001–00006 按序合并）
-- 使用：Supabase Dashboard → SQL Editor → 新查询 → 全选粘贴本文件 → Run。
-- 幂等：重复运行安全（IF NOT EXISTS / ON CONFLICT / DROP IF EXISTS）。
-- ============================================================

-- ╔══════════════════════════════════════════════════════════╗
-- ║ 00001_init_profiles_and_couples.sql
-- ╚══════════════════════════════════════════════════════════╝
-- ============================================================
-- 00001 · 阶段 0：profiles / couples / couple_members 骨架
--
-- 设计原则：
--   1. 只建立双人空间的身份骨架；邀请、日记、纪念日等业务表在阶段 1 增量新增。
--   2. 所有业务表启用行级安全（RLS）；本迁移采取保守策略：
--      - profiles：仅本人可读写自己的档案；
--      - couples / couple_members：不创建任何策略 = 连 authenticated 也全部拒绝，
--        阶段 1 由经安全校验的 RPC（事务内检查成员数与邀请有效性）操作。
--   3. 一个用户同一时间最多属于一个双人空间（unique(user_id)）；
--      一个空间最多两名成员的硬约束在阶段 1 的入组 RPC 中以事务保证。
--   4. 私有 Storage 桶 diary-media（public = false），未来存放日记照片与信件附件；
--      具体的对象级策略随阶段 1 一起建立。
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- 个人档案 ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nickname    text not null default '旅人',
  avatar_url  text,
  timezone    text not null default 'Asia/Shanghai',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is '用户档案：昵称、头像、时区；与 auth.users 一一对应';

-- ---------- 双人空间 ----------
create table if not exists public.couples (
  id           uuid primary key default gen_random_uuid(),
  display_name text,
  created_at   timestamptz not null default now()
);

comment on table public.couples is '双人空间（情侣）：成员上限 2，由入组流程与约束共同保证';

-- ---------- 成员关系 ----------
create table if not exists public.couple_members (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'member' check (role in ('founder', 'member')),
  joined_at  timestamptz not null default now(),
  unique (couple_id, user_id),
  -- 一个用户同一时间只能属于一个双人空间
  unique (user_id)
);

create index if not exists couple_members_couple_id_idx on public.couple_members (couple_id);

comment on table public.couple_members is '双人空间成员表；role: founder=邀请创建者, member=受邀加入方';

-- ---------- 行级安全 ----------
alter table public.profiles       enable row level security;
alter table public.couples        enable row level security;
alter table public.couple_members enable row level security;

-- profiles：仅本人可读写；匿名一律拒绝
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- couples / couple_members：刻意不建任何 policy（RLS 默认拒绝），
-- 客户端不可直接读写；阶段 1 通过 SECURITY DEFINER RPC 安全操作。

-- ---------- updated_at 维护 ----------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------- 私有存储桶（幂等） ----------
-- 存放日记照片与未来的信件附件；不开放公读。
-- 对象级的访问策略（仅双人空间成员可读写自己的对象）在阶段 1 建立。
insert into storage.buckets (id, name, public)
values ('diary-media', 'diary-media', false)
on conflict (id) do nothing;

-- ╔══════════════════════════════════════════════════════════╗
-- ║ 00002_stage1_diary_anniversaries_pairing.sql
-- ╚══════════════════════════════════════════════════════════╝
-- ============================================================
-- 00002 · 阶段 1：双人配对、恋爱日记、纪念日
--
-- 安全要点：
--   1. 邀请码只存 SHA-256 哈希；入组在 SECURITY DEFINER RPC 的事务里
--      完成「验码 → 锁空间 → 查人数 → 入组 → 标记已用」，并发下也加不进第三人。
--   2. 所有新表启用 RLS：
--      - 日记：作者全量可见自己的（含草稿/私密）；伴侣只能看「双方可见且已发布」的；
--      - 纪念日：双人空间有效成员可读写；
--      - 媒体行跟随所属日记的可见性。
--   3. Storage 私有桶 diary-media 增加路径级策略：
--      仅 couple/{couple_id}/... 路径下、且该空间有效成员可读写。
--   4. 所有 SECURITY DEFINER 函数固定 search_path = '' 并显式检查 auth.uid()。
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 私有帮助函数（仅供策略与其他 RPC 调用）
-- ------------------------------------------------------------
create schema if not exists private;

-- 当前用户是否为某双人空间的有效成员
create or replace function private.is_active_couple_member(
  p_couple uuid,
  p_user uuid default auth.uid()
) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.couple_members m
    where m.couple_id = p_couple and m.user_id = p_user
  );
$$;

-- 某用户是否为当前用户同一空间的伴侣
create or replace function private.is_partner(p_other uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.couple_members a
    join public.couple_members b on b.couple_id = a.couple_id and b.user_id = p_other
    where a.user_id = auth.uid()
  );
$$;

-- 从 Storage 对象路径提取 couple_id（路径约定 couple/{couple_id}/diary/{entry_id}/{file}）
-- 非法路径返回 null（策略中自然拒绝），避免策略内 cast 崩溃
create or replace function private.storage_couple_id(p_name text)
returns uuid
language plpgsql immutable security definer set search_path = ''
as $$
declare v text;
begin
  v := (storage.foldername(p_name))[2];
  return v::uuid;
exception when others then return null;
end;
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_active_couple_member(uuid, uuid) to authenticated;
grant execute on function private.is_partner(uuid) to authenticated;

-- ------------------------------------------------------------
-- 注册即建档案（昵称可来自注册元数据，之后可改）
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'nickname'), ''), '旅人'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 放宽 00001 的 profiles 读取：伴侣可读彼此档案（昵称/头像）
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (id = auth.uid() or private.is_partner(id));

-- couples / couple_members：有效成员可读自己空间的基本信息
drop policy if exists "couples_member_read" on public.couples;
create policy "couples_member_read"
  on public.couples for select to authenticated
  using (private.is_active_couple_member(id));

drop policy if exists "couple_members_member_read" on public.couple_members;
create policy "couple_members_member_read"
  on public.couple_members for select to authenticated
  using (private.is_active_couple_member(couple_id));

-- ------------------------------------------------------------
-- 邀请码：只存哈希，一次性、24 小时有效
-- ------------------------------------------------------------
create table if not exists public.couple_invitations (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  used_by    uuid references auth.users (id) on delete set null,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists couple_invitations_couple_idx on public.couple_invitations (couple_id);

alter table public.couple_invitations enable row level security;
-- 无任何策略：客户端不可直接读写邀请表（全部经 RPC）

-- ------------------------------------------------------------
-- 配对 RPC
-- ------------------------------------------------------------

-- 创建二人空间并生成邀请码（返回明文码，仅此一次展示；库中只存哈希）
create or replace function public.create_couple_space(p_display_name text default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_couple uuid;
  v_code   text;
begin
  if auth.uid() is null then
    raise exception '请先登录';
  end if;
  if exists (select 1 from public.couple_members where user_id = auth.uid()) then
    raise exception '你已经属于一个双人空间';
  end if;

  insert into public.couples (display_name)
  values (nullif(trim(p_display_name), ''))
  returning id into v_couple;

  insert into public.couple_members (couple_id, user_id, role)
  values (v_couple, auth.uid(), 'founder');

  v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12));
  insert into public.couple_invitations (couple_id, token_hash, expires_at, created_by)
  values (
    v_couple,
    encode(digest(v_code, 'sha256'), 'hex'),
    now() + interval '24 hours',
    auth.uid()
  );

  return v_code;
end;
$$;

-- 待配对时重新生成邀请码（旧的未用邀请作废）
create or replace function public.create_couple_invitation()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_couple uuid;
  v_code   text;
  v_expire timestamptz;
begin
  if auth.uid() is null then
    raise exception '请先登录';
  end if;

  select couple_id into v_couple
  from public.couple_members where user_id = auth.uid() limit 1;
  if v_couple is null then
    raise exception '你还没有双人空间';
  end if;
  if (select count(*) from public.couple_members where couple_id = v_couple) >= 2 then
    raise exception '空间成员已满，无需邀请';
  end if;

  update public.couple_invitations
     set used_at = now()
   where couple_id = v_couple and used_at is null;

  v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12));
  v_expire := now() + interval '24 hours';
  insert into public.couple_invitations (couple_id, token_hash, expires_at, created_by)
  values (v_couple, encode(digest(v_code, 'sha256'), 'hex'), v_expire, auth.uid());

  return jsonb_build_object('code', v_code, 'expiresAt', v_expire);
end;
$$;

-- 查询自己空间的待用邀请（只返回元数据，明文码不回传）
create or replace function public.get_my_couple_invitation()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_couple uuid;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception '请先登录';
  end if;

  select couple_id into v_couple
  from public.couple_members where user_id = auth.uid() limit 1;
  if v_couple is null then
    return null;
  end if;
  if (select count(*) from public.couple_members where couple_id = v_couple) >= 2 then
    return null;
  end if;

  select jsonb_build_object('expiresAt', expires_at, 'createdAt', created_at)
    into v_result
  from public.couple_invitations
  where couple_id = v_couple and used_at is null and expires_at > now()
  order by created_at desc
  limit 1;

  return v_result;
end;
$$;

-- 凭邀请码加入：验哈希 → 锁空间 → 校验人数 → 入组 → 作废邀请，事务保证不超员
create or replace function public.join_couple_with_code(p_code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_invite record;
begin
  if auth.uid() is null then
    raise exception '请先登录';
  end if;
  if p_code is null or length(trim(p_code)) = 0 then
    raise exception '请输入邀请码';
  end if;
  if exists (select 1 from public.couple_members where user_id = auth.uid()) then
    raise exception '你已经属于一个双人空间，无法再加入';
  end if;

  select id, couple_id into v_invite
  from public.couple_invitations
  where token_hash = encode(digest(upper(trim(p_code)), 'sha256'), 'hex')
    and used_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  if not found then
    raise exception '邀请码无效或已过期';
  end if;

  -- 锁定空间行，串行化并发入组
  perform 1 from public.couples where id = v_invite.couple_id for update;

  if (select count(*) from public.couple_members where couple_id = v_invite.couple_id) >= 2 then
    raise exception '这个空间已经有两位成员了';
  end if;

  insert into public.couple_members (couple_id, user_id, role)
  values (v_invite.couple_id, auth.uid(), 'member');

  update public.couple_invitations
     set used_at = now(), used_by = auth.uid()
   where id = v_invite.id;

  return v_invite.couple_id;
end;
$$;

revoke execute on function public.create_couple_space(text) from public, anon;
revoke execute on function public.create_couple_invitation() from public, anon;
revoke execute on function public.get_my_couple_invitation() from public, anon;
revoke execute on function public.join_couple_with_code(text) from public, anon;
grant execute on function public.create_couple_space(text) to authenticated;
grant execute on function public.create_couple_invitation() to authenticated;
grant execute on function public.get_my_couple_invitation() to authenticated;
grant execute on function public.join_couple_with_code(text) to authenticated;

-- ------------------------------------------------------------
-- 日记
-- ------------------------------------------------------------
create table if not exists public.diary_entries (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  author_id   uuid not null references auth.users (id) on delete cascade,
  title       text not null default '' check (char_length(title) <= 120),
  content     text not null default '' check (char_length(content) <= 20000),
  happened_on date not null,
  mood        text not null check (mood in ('joy','date_trip','memorial','new_start','heartbeat','growth')),
  category    text check (category is null or char_length(category) <= 30),
  visibility  text not null default 'shared' check (visibility in ('shared','private')),
  status      text not null default 'published' check (status in ('draft','published')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists diary_entries_couple_happened_idx
  on public.diary_entries (couple_id, happened_on desc, created_at desc);
create index if not exists diary_entries_author_idx on public.diary_entries (author_id);

comment on column public.diary_entries.happened_on is '日记发生的本地日历日（DATE 语义，前端 yyyy-mm-dd）';
comment on column public.diary_entries.mood is '心情（用户手选，不由 AI 推测）：joy/date_trip/memorial/new_start/heartbeat/growth';
comment on column public.diary_entries.visibility is 'shared=双方可见（默认）；private=仅作者可见';
comment on column public.diary_entries.status is 'draft=草稿（仅作者可见）；published=已发布';

alter table public.diary_entries enable row level security;

drop policy if exists "diary_select_visible" on public.diary_entries;
create policy "diary_select_visible"
  on public.diary_entries for select to authenticated
  using (
    author_id = auth.uid()
    or (
      visibility = 'shared'
      and status = 'published'
      and private.is_active_couple_member(couple_id)
    )
  );

drop policy if exists "diary_insert_own" on public.diary_entries;
create policy "diary_insert_own"
  on public.diary_entries for insert to authenticated
  with check (
    author_id = auth.uid()
    and private.is_active_couple_member(couple_id)
  );

drop policy if exists "diary_update_own" on public.diary_entries;
create policy "diary_update_own"
  on public.diary_entries for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists "diary_delete_own" on public.diary_entries;
create policy "diary_delete_own"
  on public.diary_entries for delete to authenticated
  using (author_id = auth.uid());

drop trigger if exists diary_entries_touch_updated_at on public.diary_entries;
create trigger diary_entries_touch_updated_at
  before update on public.diary_entries
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- 日记媒体（元数据行；文件在私有桶 diary-media）
-- ------------------------------------------------------------
create table if not exists public.diary_media (
  id             uuid primary key default gen_random_uuid(),
  diary_entry_id uuid not null references public.diary_entries (id) on delete cascade,
  storage_path   text not null,
  file_name      text not null default '',
  mime_type      text not null default 'image/jpeg',
  size_bytes     bigint not null default 0,
  position       integer not null default 0,
  uploaded_by    uuid not null references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now()
);

create index if not exists diary_media_entry_idx on public.diary_media (diary_entry_id);

alter table public.diary_media enable row level security;

-- 可见性跟随所属日记：作者的媒体全可见；伴侣仅可见共享已发布日记的媒体
drop policy if exists "diary_media_select_visible" on public.diary_media;
create policy "diary_media_select_visible"
  on public.diary_media for select to authenticated
  using (
    exists (
      select 1 from public.diary_entries de
      where de.id = diary_media.diary_entry_id
        and (
          de.author_id = auth.uid()
          or (
            de.visibility = 'shared'
            and de.status = 'published'
            and private.is_active_couple_member(de.couple_id)
          )
        )
    )
  );

drop policy if exists "diary_media_insert_author" on public.diary_media;
create policy "diary_media_insert_author"
  on public.diary_media for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.diary_entries de
      where de.id = diary_media.diary_entry_id
        and de.author_id = auth.uid()
    )
  );

drop policy if exists "diary_media_delete_author" on public.diary_media;
create policy "diary_media_delete_author"
  on public.diary_media for delete to authenticated
  using (
    exists (
      select 1 from public.diary_entries de
      where de.id = diary_media.diary_entry_id
        and de.author_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 纪念日（DATE 语义；每年重复或一次性）
-- ------------------------------------------------------------
create table if not exists public.anniversaries (
  id              uuid primary key default gen_random_uuid(),
  couple_id       uuid not null references public.couples (id) on delete cascade,
  title           text not null check (char_length(title) <= 60),
  kind            text not null default 'custom' check (kind in ('met','together','birthday','first_date','custom')),
  anniversary_date date not null,
  repeats_yearly  boolean not null default true,
  note            text check (note is null or char_length(note) <= 500),
  linked_diary_id uuid references public.diary_entries (id) on delete set null,
  created_by      uuid not null references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists anniversaries_couple_date_idx
  on public.anniversaries (couple_id, anniversary_date);

alter table public.anniversaries enable row level security;

drop policy if exists "anniversaries_member_all" on public.anniversaries;
create policy "anniversaries_member_select"
  on public.anniversaries for select to authenticated
  using (private.is_active_couple_member(couple_id));

create policy "anniversaries_member_insert"
  on public.anniversaries for insert to authenticated
  with check (
    created_by = auth.uid()
    and private.is_active_couple_member(couple_id)
  );

create policy "anniversaries_member_update"
  on public.anniversaries for update to authenticated
  using (private.is_active_couple_member(couple_id))
  with check (private.is_active_couple_member(couple_id));

create policy "anniversaries_member_delete"
  on public.anniversaries for delete to authenticated
  using (private.is_active_couple_member(couple_id));

drop trigger if exists anniversaries_touch_updated_at on public.anniversaries;
create trigger anniversaries_touch_updated_at
  before update on public.anniversaries
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- Storage：私有桶 diary-media 的路径级策略
-- 路径约定：couple/{couple_id}/diary/{entry_id}/{file}
-- ------------------------------------------------------------
drop policy if exists "diary_media_bucket_read" on storage.objects;
create policy "diary_media_bucket_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'diary-media'
    and private.is_active_couple_member(private.storage_couple_id(name))
  );

drop policy if exists "diary_media_bucket_insert" on storage.objects;
create policy "diary_media_bucket_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'diary-media'
    and (storage.foldername(name))[1] = 'couple'
    and private.is_active_couple_member(private.storage_couple_id(name))
  );

drop policy if exists "diary_media_bucket_delete" on storage.objects;
create policy "diary_media_bucket_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'diary-media'
    and private.is_active_couple_member(private.storage_couple_id(name))
  );

-- ╔══════════════════════════════════════════════════════════╗
-- ║ 00003_stage2_story_books.sql
-- ╚══════════════════════════════════════════════════════════╝
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

-- ╔══════════════════════════════════════════════════════════╗
-- ║ 00004_stage3_wishes_letters.sql
-- ╚══════════════════════════════════════════════════════════╝
-- ============================================================
-- 00004 · 阶段 3：落叶心愿瓶 + 时光邮局
--
-- 安全要点（时光邮局）：
--   1. 「封套」与「正文」分表：letters 只存元数据（收件人、解锁时间、
--      状态），连标题都不放——收件人在解锁前只能看到「有一封信」。
--   2. letter_contents **没有任何 SELECT 策略**：客户端（含成员本人）
--      无法直接读取正文；唯一入口是 SECURITY DEFINER RPC
--      read_letter()，它在服务端校验：成员身份 + 服务端时间 >= unlock_at
--      + 收件规则 + 状态，任何一步不满足即拒绝。
--   3. 撤回 revoke_letter() 仅作者、且仅在到期前（服务端时间）可执行。
--   4. 本阶段信件不挂照片附件（附件需要 Edge Function 生成服务端签名
--      链接才能保证未到期不泄露，待后续阶段补齐，不先留漏洞）。
--   5. Storage 收紧：diary-media 桶策略限定 diary/ 路径，防止未来误用。
-- ============================================================

-- ------------------------------------------------------------
-- 心愿瓶
-- ------------------------------------------------------------
create table if not exists public.wishes (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  title        text not null check (char_length(title) <= 80),
  description  text check (description is null or char_length(description) <= 1000),
  created_by   uuid not null references auth.users (id) on delete cascade,
  due_date     date,
  priority     text not null default 'normal' check (priority in ('low','normal','high')),
  status       text not null default 'wish' check (status in ('wish','planned','done','archived')),
  place_note   text check (place_note is null or char_length(place_note) <= 120),
  completed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists wishes_couple_status_idx on public.wishes (couple_id, status);

comment on column public.wishes.status is 'wish=想做 planned=计划中 done=已完成 archived=已归档（取消）';
comment on column public.wishes.completed_at is '完成时刻；由完成操作写入，记录协同操作的时间';

alter table public.wishes enable row level security;

-- 双人空间共享资源：成员均可读写（状态由任一成员协同推进）
drop policy if exists "wishes_member_select" on public.wishes;
create policy "wishes_member_select"
  on public.wishes for select to authenticated
  using (private.is_active_couple_member(couple_id));

drop policy if exists "wishes_member_insert" on public.wishes;
create policy "wishes_member_insert"
  on public.wishes for insert to authenticated
  with check (
    created_by = auth.uid()
    and private.is_active_couple_member(couple_id)
  );

drop policy if exists "wishes_member_update" on public.wishes;
create policy "wishes_member_update"
  on public.wishes for update to authenticated
  using (private.is_active_couple_member(couple_id))
  with check (private.is_active_couple_member(couple_id));

drop policy if exists "wishes_member_delete" on public.wishes;
create policy "wishes_member_delete"
  on public.wishes for delete to authenticated
  using (private.is_active_couple_member(couple_id));

drop trigger if exists wishes_touch_updated_at on public.wishes;
create trigger wishes_touch_updated_at
  before update on public.wishes
  for each row execute function public.touch_updated_at();

-- 状态变更审计：谁在什么时候做了什么
create table if not exists public.wish_events (
  id          uuid primary key default gen_random_uuid(),
  wish_id     uuid not null references public.wishes (id) on delete cascade,
  actor_id    uuid not null references auth.users (id) on delete cascade,
  action      text not null check (action in ('created','status_changed','edited')),
  from_status text,
  to_status   text,
  created_at  timestamptz not null default now()
);

create index if not exists wish_events_wish_idx on public.wish_events (wish_id);

alter table public.wish_events enable row level security;

drop policy if exists "wish_events_member_select" on public.wish_events;
create policy "wish_events_member_select"
  on public.wish_events for select to authenticated
  using (
    exists (
      select 1 from public.wishes w
      where w.id = wish_events.wish_id
        and private.is_active_couple_member(w.couple_id)
    )
  );

drop policy if exists "wish_events_member_insert" on public.wish_events;
create policy "wish_events_member_insert"
  on public.wish_events for insert to authenticated
  with check (
    actor_id = auth.uid()
    and exists (
      select 1 from public.wishes w
      where w.id = wish_events.wish_id
        and private.is_active_couple_member(w.couple_id)
    )
  );

-- 心愿 ↔ 日记关联：删除心愿只删关联行，绝不连带删除日记（反之亦然）
create table if not exists public.wish_diary_links (
  wish_id        uuid not null references public.wishes (id) on delete cascade,
  diary_entry_id uuid not null references public.diary_entries (id) on delete cascade,
  linked_by      uuid not null references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (wish_id, diary_entry_id)
);

alter table public.wish_diary_links enable row level security;

drop policy if exists "wish_links_member_select" on public.wish_diary_links;
create policy "wish_links_member_select"
  on public.wish_diary_links for select to authenticated
  using (
    exists (
      select 1 from public.wishes w
      where w.id = wish_diary_links.wish_id
        and private.is_active_couple_member(w.couple_id)
    )
  );

drop policy if exists "wish_links_member_insert" on public.wish_diary_links;
create policy "wish_links_member_insert"
  on public.wish_diary_links for insert to authenticated
  with check (
    linked_by = auth.uid()
    and exists (
      select 1 from public.wishes w
      where w.id = wish_diary_links.wish_id
        and private.is_active_couple_member(w.couple_id)
    )
    -- 关联的日记必须属于同一空间且对当前用户可见（作者或共享已发布）
    and exists (
      select 1 from public.diary_entries de
      where de.id = wish_diary_links.diary_entry_id
        and de.couple_id = (select couple_id from public.wishes where id = wish_id)
        and (
          de.author_id = auth.uid()
          or (de.visibility = 'shared' and de.status = 'published')
        )
    )
  );

drop policy if exists "wish_links_member_delete" on public.wish_diary_links;
create policy "wish_links_member_delete"
  on public.wish_diary_links for delete to authenticated
  using (
    exists (
      select 1 from public.wishes w
      where w.id = wish_diary_links.wish_id
        and private.is_active_couple_member(w.couple_id)
    )
  );

-- ------------------------------------------------------------
-- 时光邮局：封套（letters）与正文（letter_contents）分离
-- ------------------------------------------------------------
create table if not exists public.letters (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples (id) on delete cascade,
  author_id  uuid not null references auth.users (id) on delete cascade,
  recipient  text not null check (recipient in ('partner','both')),
  unlock_at  timestamptz not null,
  status     text not null default 'sealed' check (status in ('sealed','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (unlock_at > created_at)
);

create index if not exists letters_couple_idx on public.letters (couple_id, unlock_at);

comment on table public.letters is '信件封套：只有元数据（无标题/正文），解锁前收件人仅知「有一封信」';
comment on column public.letters.recipient is 'partner=写给对方（非作者成员）；both=写给双方';

alter table public.letters enable row level security;

-- 封套可读：空间成员（只有元数据，不含内容）
drop policy if exists "letters_member_select" on public.letters;
create policy "letters_member_select"
  on public.letters for select to authenticated
  using (private.is_active_couple_member(couple_id));

drop policy if exists "letters_member_insert" on public.letters;
create policy "letters_member_insert"
  on public.letters for insert to authenticated
  with check (
    author_id = auth.uid()
    and private.is_active_couple_member(couple_id)
  );

-- 不设 update 策略：状态只能经 revoke_letter RPC 修改
-- 删除：仅作者
drop policy if exists "letters_author_delete" on public.letters;
create policy "letters_author_delete"
  on public.letters for delete to authenticated
  using (author_id = auth.uid());

-- 正文表：刻意不建任何 SELECT/UPDATE/DELETE 策略（客户端零访问），
-- 唯一读入口是 read_letter RPC；行随信件级联删除
create table if not exists public.letter_contents (
  letter_id  uuid primary key references public.letters (id) on delete cascade,
  title      text not null check (char_length(title) <= 80),
  body       text not null check (char_length(body) <= 10000),
  updated_at timestamptz not null default now()
);

alter table public.letter_contents enable row level security;

drop policy if exists "letter_contents_author_insert" on public.letter_contents;
create policy "letter_contents_author_insert"
  on public.letter_contents for insert to authenticated
  with check (
    exists (
      select 1 from public.letters l
      where l.id = letter_contents.letter_id
        and l.author_id = auth.uid()
        and private.is_active_couple_member(l.couple_id)
    )
  );

-- ------------------------------------------------------------
-- 读信 RPC：服务端校验身份 + 服务端时间 + 收件规则 + 状态
-- ------------------------------------------------------------
create or replace function public.read_letter(p_letter_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_letter  public.letters%rowtype;
  v_content public.letter_contents%rowtype;
begin
  if auth.uid() is null then
    raise exception '请先登录';
  end if;

  select * into v_letter from public.letters where id = p_letter_id;
  if not found then
    raise exception '信件不存在';
  end if;

  if not private.is_active_couple_member(v_letter.couple_id, auth.uid()) then
    raise exception '无权访问这封信';
  end if;

  -- 作者随时可读自己写的信；收件人必须：未撤回 且 已到解锁时间（服务端时间）
  if v_letter.author_id <> auth.uid() then
    if v_letter.status <> 'sealed' then
      raise exception '这封信已被寄件人撤回';
    end if;
    if now() < v_letter.unlock_at then
      raise exception '这封信还没有到开启时间';
    end if;
  end if;

  select * into v_content from public.letter_contents where letter_id = p_letter_id;
  if not found then
    raise exception '信件内容缺失';
  end if;

  return jsonb_build_object(
    'id', v_letter.id,
    'authorId', v_letter.author_id,
    'recipient', v_letter.recipient,
    'unlockAt', v_letter.unlock_at,
    'status', v_letter.status,
    'title', v_content.title,
    'body', v_content.body
  );
end;
$$;

-- 撤回 RPC：仅作者、仅到期前（服务端时间）
create or replace function public.revoke_letter(p_letter_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_letter public.letters%rowtype;
begin
  if auth.uid() is null then
    raise exception '请先登录';
  end if;

  select * into v_letter from public.letters where id = p_letter_id for update;
  if not found then
    raise exception '信件不存在';
  end if;
  if v_letter.author_id <> auth.uid() then
    raise exception '只有寄件人可以撤回';
  end if;
  if v_letter.status <> 'sealed' then
    raise exception '这封信已经撤回过了';
  end if;
  if now() >= v_letter.unlock_at then
    raise exception '信件已经到达开启时间，无法再撤回';
  end if;

  update public.letters set status = 'revoked', updated_at = now() where id = p_letter_id;
end;
$$;

revoke execute on function public.read_letter(uuid) from public, anon;
revoke execute on function public.revoke_letter(uuid) from public, anon;
grant execute on function public.read_letter(uuid) to authenticated;
grant execute on function public.revoke_letter(uuid) to authenticated;

-- ------------------------------------------------------------
-- Storage 收紧：diary-media 桶仅允许 diary/ 路径（信件等其他路径全拒）
-- ------------------------------------------------------------
drop policy if exists "diary_media_bucket_read" on storage.objects;
create policy "diary_media_bucket_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'diary-media'
    and (storage.foldername(name))[3] = 'diary'
    and private.is_active_couple_member(private.storage_couple_id(name))
  );

drop policy if exists "diary_media_bucket_insert" on storage.objects;
create policy "diary_media_bucket_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'diary-media'
    and (storage.foldername(name))[1] = 'couple'
    and (storage.foldername(name))[3] = 'diary'
    and private.is_active_couple_member(private.storage_couple_id(name))
  );

drop policy if exists "diary_media_bucket_delete" on storage.objects;
create policy "diary_media_bucket_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'diary-media'
    and (storage.foldername(name))[3] = 'diary'
    and private.is_active_couple_member(private.storage_couple_id(name))
  );

-- ╔══════════════════════════════════════════════════════════╗
-- ║ 00005_stage4_places_quiz.sql
-- ╚══════════════════════════════════════════════════════════╝
-- ============================================================
-- 00005 · 阶段 4：双人恋爱地图 + 默契小问答
--
-- 安全要点：
--   1. 地点-日记关联的可见性**跟随日记本身**：关联行的 SELECT 策略
--      要求该日记对当前用户可见（作者或共享已发布）——私密日记不会
--      透过地图标记、坐标或关联列表泄露。
--   2. 问答「两阶段可见性」由 RLS 强制：对方的答案只有当
--      「对方已提交 且 我已提交」时才可读；草稿始终只有作者可见。
--      直接携带本人 JWT 查询 REST 也无法绕过。
--   3. 不自动定位、不存轨迹：places 只保存用户主动填写的信息，
--      经纬度为可选字段。
-- ============================================================

-- ------------------------------------------------------------
-- 地点足迹
-- ------------------------------------------------------------
create table if not exists public.places (
  id            uuid primary key default gen_random_uuid(),
  couple_id     uuid not null references public.couples (id) on delete cascade,
  name          text not null check (char_length(name) <= 60),
  region        text check (region is null or char_length(region) <= 60),
  note          text check (note is null or char_length(note) <= 500),
  happened_on   date,
  latitude      numeric(9,6),
  longitude     numeric(9,6),
  is_special    boolean not null default false,
  special_label text check (special_label is null or char_length(special_label) <= 20),
  created_by    uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists places_couple_idx on public.places (couple_id, happened_on);

comment on column public.places.latitude is '可选；仅在用户主动提供（或逐次授权定位）时填写，绝无自动采集';

alter table public.places enable row level security;

drop policy if exists "places_member_select" on public.places;
create policy "places_member_select"
  on public.places for select to authenticated
  using (private.is_active_couple_member(couple_id));

drop policy if exists "places_member_insert" on public.places;
create policy "places_member_insert"
  on public.places for insert to authenticated
  with check (
    created_by = auth.uid()
    and private.is_active_couple_member(couple_id)
  );

drop policy if exists "places_member_update" on public.places;
create policy "places_member_update"
  on public.places for update to authenticated
  using (private.is_active_couple_member(couple_id))
  with check (private.is_active_couple_member(couple_id));

drop policy if exists "places_member_delete" on public.places;
create policy "places_member_delete"
  on public.places for delete to authenticated
  using (private.is_active_couple_member(couple_id));

drop trigger if exists places_touch_updated_at on public.places;
create trigger places_touch_updated_at
  before update on public.places
  for each row execute function public.touch_updated_at();

-- 地点 ↔ 日记：可见性跟随日记（私密日记的关联行仅作者可见）
create table if not exists public.diary_place_links (
  place_id        uuid not null references public.places (id) on delete cascade,
  diary_entry_id  uuid not null references public.diary_entries (id) on delete cascade,
  linked_by       uuid not null references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (place_id, diary_entry_id)
);

alter table public.diary_place_links enable row level security;

drop policy if exists "place_links_select_visible" on public.diary_place_links;
create policy "place_links_select_visible"
  on public.diary_place_links for select to authenticated
  using (
    exists (select 1 from public.places p where p.id = diary_place_links.place_id and private.is_active_couple_member(p.couple_id))
    and exists (
      select 1 from public.diary_entries de
      where de.id = diary_place_links.diary_entry_id
        and (
          de.author_id = auth.uid()
          or (de.visibility = 'shared' and de.status = 'published' and private.is_active_couple_member(de.couple_id))
        )
    )
  );

drop policy if exists "place_links_member_insert" on public.diary_place_links;
create policy "place_links_member_insert"
  on public.diary_place_links for insert to authenticated
  with check (
    linked_by = auth.uid()
    and exists (select 1 from public.places p where p.id = diary_place_links.place_id and private.is_active_couple_member(p.couple_id))
    and exists (
      select 1 from public.diary_entries de
      where de.id = diary_place_links.diary_entry_id
        and de.couple_id = (select couple_id from public.places where id = place_id)
        and (
          de.author_id = auth.uid()
          or (de.visibility = 'shared' and de.status = 'published')
        )
    )
  );

drop policy if exists "place_links_member_delete" on public.diary_place_links;
create policy "place_links_member_delete"
  on public.diary_place_links for delete to authenticated
  using (
    exists (select 1 from public.places p where p.id = diary_place_links.place_id and private.is_active_couple_member(p.couple_id))
  );

-- ------------------------------------------------------------
-- 默契小问答
-- ------------------------------------------------------------
create table if not exists public.question_bank (
  id       uuid primary key,
  category text not null check (category in ('light','memory','future','know')),
  content  text not null check (char_length(content) <= 200),
  unique (content)
);

alter table public.question_bank enable row level security;

drop policy if exists "question_bank_read" on public.question_bank;
create policy "question_bank_read"
  on public.question_bank for select to authenticated
  using (true);

-- 题库种子（固定 UUID，与前端 src/features/quiz/questionBank.ts 一致；幂等）
insert into public.question_bank (id, category, content) values
  ('11111111-1111-4111-8111-111111111101','light','如果用一种食物形容今天，会是什么？'),
  ('11111111-1111-4111-8111-111111111102','light','最近有什么小事让你笑出了声？'),
  ('11111111-1111-4111-8111-111111111103','light','如果今天是一种天气，会是什么天气？'),
  ('11111111-1111-4111-8111-111111111104','light','你现在最想吃到的一样东西是什么？'),
  ('11111111-1111-4111-8111-111111111105','light','最近单曲循环的一首歌是什么？为什么？'),
  ('11111111-1111-4111-8111-111111111106','light','如果这个周末突然多出一天，你想怎么过？'),
  ('22222222-2222-4222-8222-222222222201','memory','第一次见面时，你注意到了对方什么？'),
  ('22222222-2222-4222-8222-222222222202','memory','哪一次一起吃的饭让你印象最深？'),
  ('22222222-2222-4222-8222-222222222203','memory','我们之间哪件小事，你现在想起来还会笑？'),
  ('22222222-2222-4222-8222-222222222204','memory','哪一次旅行（或出门）最想再来一次？'),
  ('22222222-2222-4222-8222-222222222205','memory','你记忆里我们最狼狈但最好笑的瞬间是什么？'),
  ('22222222-2222-4222-8222-222222222206','memory','第一次说「我喜欢你」之前，你在想什么？'),
  ('33333333-3333-4333-8333-333333333301','future','想一起去的下一座城市是哪里？为什么是它？'),
  ('33333333-3333-4333-8333-333333333302','future','三年后的一个普通傍晚，你希望我们在做什么？'),
  ('33333333-3333-4333-8333-333333333303','future','有什么想一起养成的小习惯？'),
  ('33333333-3333-4333-8333-333333333304','future','想一起学的一样新东西是什么？'),
  ('33333333-3333-4333-8333-333333333305','future','如果将来养一只小动物，你希望是什么？叫什么名字？'),
  ('33333333-3333-4333-8333-333333333306','future','下一个想一起庆祝的小日子是什么？'),
  ('44444444-4444-4444-8444-444444444401','know','哪一件小事会让你感到被珍惜？'),
  ('44444444-4444-4444-8444-444444444402','know','心情不好的时候，你更希望被怎样安慰？'),
  ('44444444-4444-4444-8444-444444444403','know','你最近在担心什么？（不想说也可以写「暂不分享」）'),
  ('44444444-4444-4444-8444-444444444404','know','对方做过什么让你特别感动但没说出口的事？'),
  ('44444444-4444-4444-8444-444444444405','know','如果用一种季节形容我们的关系，会是什么季节？'),
  ('44444444-4444-4444-8444-444444444406','know','你希望我更常做的一件小事是什么？')
on conflict (id) do nothing;

-- 问答会话
create table if not exists public.question_sessions (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples (id) on delete cascade,
  question_id uuid not null references public.question_bank (id),
  status     text not null default 'open' check (status in ('open','revealed')),
  started_by uuid not null references auth.users (id) on delete cascade,
  ended_early_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists question_sessions_couple_idx on public.question_sessions (couple_id, created_at desc);

alter table public.question_sessions enable row level security;

drop policy if exists "question_sessions_member_select" on public.question_sessions;
create policy "question_sessions_member_select"
  on public.question_sessions for select to authenticated
  using (private.is_active_couple_member(couple_id));

drop policy if exists "question_sessions_member_insert" on public.question_sessions;
create policy "question_sessions_member_insert"
  on public.question_sessions for insert to authenticated
  with check (
    started_by = auth.uid()
    and private.is_active_couple_member(couple_id)
  );

drop policy if exists "question_sessions_member_update" on public.question_sessions;
create policy "question_sessions_member_update"
  on public.question_sessions for update to authenticated
  using (private.is_active_couple_member(couple_id))
  with check (private.is_active_couple_member(couple_id));

drop policy if exists "question_sessions_member_delete" on public.question_sessions;
create policy "question_sessions_member_delete"
  on public.question_sessions for delete to authenticated
  using (private.is_active_couple_member(couple_id));

drop trigger if exists question_sessions_touch_updated_at on public.question_sessions;
create trigger question_sessions_touch_updated_at
  before update on public.question_sessions
  for each row execute function public.touch_updated_at();

-- 答案：两阶段可见性（核心安全）
create table if not exists public.question_answers (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.question_sessions (id) on delete cascade,
  author_id    uuid not null references auth.users (id) on delete cascade,
  content      text not null default '' check (char_length(content) <= 500),
  emoji        text check (emoji is null or char_length(emoji) <= 10),
  submitted    boolean not null default false,
  submitted_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (session_id, author_id)
);

create index if not exists question_answers_session_idx on public.question_answers (session_id);

alter table public.question_answers enable row level security;

-- 我的答案（含草稿）随时可读；对方的答案仅在「对方已提交 且 我已提交」时可读
drop policy if exists "answers_two_phase_select" on public.question_answers;
create policy "answers_two_phase_select"
  on public.question_answers for select to authenticated
  using (
    author_id = auth.uid()
    or (
      submitted = true
      and exists (
        select 1 from public.question_sessions s
        where s.id = question_answers.session_id
          and private.is_active_couple_member(s.couple_id)
      )
      and exists (
        select 1 from public.question_answers mine
        where mine.session_id = question_answers.session_id
          and mine.author_id = auth.uid()
          and mine.submitted = true
      )
    )
  );

drop policy if exists "answers_author_insert" on public.question_answers;
create policy "answers_author_insert"
  on public.question_answers for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.question_sessions s
      where s.id = question_answers.session_id
        and private.is_active_couple_member(s.couple_id)
    )
  );

drop policy if exists "answers_author_update" on public.question_answers;
create policy "answers_author_update"
  on public.question_answers for update to authenticated
  using (
    author_id = auth.uid()
    and exists (
      select 1 from public.question_sessions s
      where s.id = question_answers.session_id
        and private.is_active_couple_member(s.couple_id)
    )
  );

-- 草稿只能由作者本人撤销/删除
drop policy if exists "answers_author_delete" on public.question_answers;
create policy "answers_author_delete"
  on public.question_answers for delete to authenticated
  using (author_id = auth.uid());

-- 收藏为日记的记录
create table if not exists public.question_favorites (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.question_sessions (id) on delete cascade,
  diary_entry_id uuid not null references public.diary_entries (id) on delete cascade,
  created_by     uuid not null references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now(),
  unique (session_id)
);

alter table public.question_favorites enable row level security;

drop policy if exists "question_favorites_member_select" on public.question_favorites;
create policy "question_favorites_member_select"
  on public.question_favorites for select to authenticated
  using (
    exists (
      select 1 from public.question_sessions s
      where s.id = question_favorites.session_id
        and private.is_active_couple_member(s.couple_id)
    )
  );

drop policy if exists "question_favorites_member_insert" on public.question_favorites;
create policy "question_favorites_member_insert"
  on public.question_favorites for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.question_sessions s
      where s.id = question_favorites.session_id
        and private.is_active_couple_member(s.couple_id)
    )
  );

-- ╔══════════════════════════════════════════════════════════╗
-- ║ 00006_stage6_golden_leaves_dissolve.sql
-- ╚══════════════════════════════════════════════════════════╝
-- ============================================================
-- 00006 · 阶段 6：年度金叶（用户选择）+ 解除配对
--
-- 安全要点：
--   1. golden_leaves 只存「用户自己选的」年度标题与最珍贵的一天；
--      应用绝不自动评价任何一天。
--   2. dissolve_couple RPC：删除双方成员关系，立即停止互相访问；
--      共同数据（日记/纪念日/地点/心愿/问答/信件）保留但双方均失去
--      成员资格（冻结，不可见），绝不私自清空任何一方创作的内容。
-- ============================================================

create table if not exists public.golden_leaves (
  couple_id    uuid not null references public.couples (id) on delete cascade,
  year         integer not null check (year between 2000 and 2100),
  title        text check (title is null or char_length(title) <= 60),
  precious_day date,
  created_by   uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (couple_id, year)
);

alter table public.golden_leaves enable row level security;

drop policy if exists "golden_leaves_member_select" on public.golden_leaves;
create policy "golden_leaves_member_select"
  on public.golden_leaves for select to authenticated
  using (private.is_active_couple_member(couple_id));

drop policy if exists "golden_leaves_member_insert" on public.golden_leaves;
create policy "golden_leaves_member_insert"
  on public.golden_leaves for insert to authenticated
  with check (
    created_by = auth.uid()
    and private.is_active_couple_member(couple_id)
  );

drop policy if exists "golden_leaves_member_update" on public.golden_leaves;
create policy "golden_leaves_member_update"
  on public.golden_leaves for update to authenticated
  using (private.is_active_couple_member(couple_id))
  with check (private.is_active_couple_member(couple_id));

drop trigger if exists golden_leaves_touch_updated_at on public.golden_leaves;
create trigger golden_leaves_touch_updated_at
  before update on public.golden_leaves
  for each row execute function public.touch_updated_at();

-- 解除配对：删除双方成员关系；共同数据保留但冻结（无成员 → RLS 全拒）
create or replace function public.dissolve_couple()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_couple uuid;
begin
  if auth.uid() is null then
    raise exception '请先登录';
  end if;

  select couple_id into v_couple
  from public.couple_members where user_id = auth.uid() limit 1;
  if v_couple is null then
    raise exception '你还没有双人空间';
  end if;

  -- 作废未用邀请，防止旧码在解除后加入
  update public.couple_invitations
     set used_at = now()
   where couple_id = v_couple and used_at is null;

  delete from public.couple_members where couple_id = v_couple;
end;
$$;

revoke execute on function public.dissolve_couple() from public, anon;
grant execute on function public.dissolve_couple() to authenticated;
