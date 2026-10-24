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
