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
