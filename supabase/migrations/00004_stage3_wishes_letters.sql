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
