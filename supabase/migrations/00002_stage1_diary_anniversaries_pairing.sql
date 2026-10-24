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
