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
