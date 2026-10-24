-- ============================================================
-- 00007 · 修复：pgcrypto 不可见（extensions 架构 vs 空 search_path）
--
-- 现象：Supabase 新项目把 pgcrypto 安装在 extensions 架构；
-- 安全函数固定 search_path='' 后，gen_random_bytes()/digest() 不可见，
-- 导致 create_couple_space 运行时报 42883；个别函数未能创建。
-- 修复：全部改用 PostgreSQL 内置（pg_catalog，无需扩展）能力：
--   随机码：md5(gen_random_uuid() || clock_timestamp()) 取前 12 位十六进制
--   哈希  ：encode(sha256(convert_to(code,'UTF8')),'hex')
-- 安全性不变：邀请码仍只存哈希、24 小时、一次性、人数上限事务校验。
-- 本文件幂等，可重复运行；同时重建缺失的 join/read/revoke 函数。
-- ============================================================

-- 生成 12 位大写十六进制邀请码（CSPRNG：基于内置 gen_random_uuid）
create or replace function public.gen_invite_code()
returns text
language sql volatile security definer set search_path = ''
as $$
  select upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 12))
$$;

-- 邀请码 → SHA-256 哈希（内置 sha256）
create or replace function public.invite_hash(p_code text)
returns text
language sql immutable security definer set search_path = ''
as $$
  select encode(sha256(convert_to(upper(trim(p_code)), 'UTF8')), 'hex')
$$;

-- ---------- 重建配对三函数（调用上面的内置实现） ----------

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

  v_code := public.gen_invite_code();
  insert into public.couple_invitations (couple_id, token_hash, expires_at, created_by)
  values (v_couple, public.invite_hash(v_code), now() + interval '24 hours', auth.uid());

  return v_code;
end;
$$;

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

  select couple_id into v_couple from public.couple_members where user_id = auth.uid() limit 1;
  if v_couple is null then
    raise exception '你还没有双人空间';
  end if;
  if (select count(*) from public.couple_members where couple_id = v_couple) >= 2 then
    raise exception '空间成员已满，无需邀请';
  end if;

  update public.couple_invitations set used_at = now()
   where couple_id = v_couple and used_at is null;

  v_code := public.gen_invite_code();
  v_expire := now() + interval '24 hours';
  insert into public.couple_invitations (couple_id, token_hash, expires_at, created_by)
  values (v_couple, public.invite_hash(v_code), v_expire, auth.uid());

  return jsonb_build_object('code', v_code, 'expiresAt', v_expire);
end;
$$;

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

  select couple_id into v_couple from public.couple_members where user_id = auth.uid() limit 1;
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
  where token_hash = public.invite_hash(p_code)
    and used_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  if not found then
    raise exception '邀请码无效或已过期';
  end if;

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

-- ---------- 重建时光邮局两函数（此前未能创建） ----------

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

-- ---------- 权限与缓存 ----------
revoke execute on function public.gen_invite_code() from public, anon;
revoke execute on function public.invite_hash(text) from public, anon;
revoke execute on function public.create_couple_space(text) from public, anon;
revoke execute on function public.create_couple_invitation() from public, anon;
revoke execute on function public.get_my_couple_invitation() from public, anon;
revoke execute on function public.join_couple_with_code(text) from public, anon;
revoke execute on function public.read_letter(uuid) from public, anon;
revoke execute on function public.revoke_letter(uuid) from public, anon;

grant execute on function public.create_couple_space(text) to authenticated;
grant execute on function public.create_couple_invitation() to authenticated;
grant execute on function public.get_my_couple_invitation() to authenticated;
grant execute on function public.join_couple_with_code(text) to authenticated;
grant execute on function public.read_letter(uuid) to authenticated;
grant execute on function public.revoke_letter(uuid) to authenticated;

-- 让 PostgREST 立即看到新函数
notify pgrst, 'reload schema';
