-- =====================================================================
-- 0001_init.sql
-- Werewolf Online — Khởi tạo schema, RLS, function cho game Ma Sói
-- Chạy bằng: supabase db push  (hoặc dán vào SQL Editor trên Supabase)
-- =====================================================================

-- ---------------------------------------------------------------------
-- EXTENSIONS
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- =====================================================================
-- 1. PROFILES
-- =====================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default 'Player',
  avatar_url text,
  is_guest boolean not null default false,
  wins int not null default 0,
  losses int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Ai cũng xem được profile công khai"
  on public.profiles for select
  using (true);

create policy "Chỉ tự sửa profile của mình"
  on public.profiles for update
  using (auth.uid() = id);

-- Tự động tạo profile khi có user mới (kể cả guest / anon sign-in)
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nickname, is_guest)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nickname', 'Player' || substr(new.id::text, 1, 4)),
    coalesce((new.is_anonymous)::boolean, false)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- 2. ROOMS
-- =====================================================================
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'lobby'
    check (status in ('lobby', 'playing', 'finished')),
  settings jsonb not null default '{
    "roles": {"wolf": 1, "seer": 1, "guard": 0, "witch": 0, "hunter": 0, "cupid": 0},
    "timers": {"discussion": 90, "vote": 30, "night": 45},
    "allowGhostChat": true,
    "allowWolfChat": true
  }'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.rooms enable row level security;

create policy "Ai đăng nhập cũng xem được phòng (để join bằng code)"
  on public.rooms for select
  using (auth.role() = 'authenticated');

create policy "User đăng nhập được tạo phòng, tự là host"
  on public.rooms for insert
  with check (auth.uid() = host_id);

create policy "Chỉ host được sửa phòng"
  on public.rooms for update
  using (auth.uid() = host_id);

-- Sinh mã phòng 6 ký tự, tránh ký tự dễ nhầm (0/O, 1/I)
create function public.generate_room_code()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..6 loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  end loop;
  return result;
end;
$$;

-- =====================================================================
-- 3. ROOM_PLAYERS
-- =====================================================================
create table public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  is_ready boolean not null default false,
  is_connected boolean not null default true,
  joined_at timestamptz not null default now(),
  unique (room_id, profile_id)
);

alter table public.room_players enable row level security;

create policy "Xem được người chơi trong phòng mình tham gia"
  on public.room_players for select
  using (
    exists (
      select 1 from public.room_players rp
      where rp.room_id = room_players.room_id
        and rp.profile_id = auth.uid()
    )
  );

create policy "Tự thêm mình vào phòng"
  on public.room_players for insert
  with check (auth.uid() = profile_id);

create policy "Tự sửa trạng thái của mình (ready/connected)"
  on public.room_players for update
  using (auth.uid() = profile_id);

create policy "Tự rời phòng hoặc host kick"
  on public.room_players for delete
  using (
    auth.uid() = profile_id
    or auth.uid() = (select host_id from public.rooms where id = room_id)
  );

-- =====================================================================
-- 4. GAME_SESSIONS
-- =====================================================================
create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  phase text not null default 'setup'
    check (phase in (
      'setup', 'night_intro', 'night_actions', 'night_resolve',
      'day_result', 'day_discussion', 'day_vote', 'day_vote_result',
      'game_over'
    )),
  day_number int not null default 0,
  phase_ends_at timestamptz,
  winner text check (winner in ('wolves', 'villagers', null)),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

alter table public.game_sessions enable row level security;

create policy "Xem được session của phòng mình tham gia"
  on public.game_sessions for select
  using (
    exists (
      select 1 from public.room_players rp
      where rp.room_id = game_sessions.room_id
        and rp.profile_id = auth.uid()
    )
  );

-- =====================================================================
-- 5. GAME_PLAYERS
-- =====================================================================
create table public.game_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  is_alive boolean not null default true,
  died_at_phase text,
  died_at_day int,
  lover_id uuid references public.game_players(id),
  unique (session_id, profile_id)
);

alter table public.game_players enable row level security;

create policy "Xem role có điều kiện"
  on public.game_players for select
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.game_sessions gs
      where gs.id = game_players.session_id
        and gs.phase = 'game_over'
    )
    or exists (
      select 1 from public.game_players me
      where me.session_id = game_players.session_id
        and me.profile_id = auth.uid()
        and me.is_alive = false
    )
  );

-- =====================================================================
-- 6. NIGHT_ACTIONS
-- =====================================================================
create table public.night_actions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  day_number int not null,
  actor_id uuid not null references public.game_players(id) on delete cascade,
  action_type text not null check (action_type in ('kill', 'save', 'check', 'protect', 'link')),
  target_id uuid references public.game_players(id),
  created_at timestamptz not null default now(),
  unique (session_id, day_number, actor_id, action_type)
);

alter table public.night_actions enable row level security;

create policy "Chỉ actor xem được hành động của chính mình"
  on public.night_actions for select
  using (
    exists (
      select 1 from public.game_players gp
      where gp.id = night_actions.actor_id
        and gp.profile_id = auth.uid()
    )
  );

create policy "Chỉ actor được ghi hành động của chính mình"
  on public.night_actions for insert
  with check (
    exists (
      select 1 from public.game_players gp
      where gp.id = night_actions.actor_id
        and gp.profile_id = auth.uid()
        and gp.is_alive = true
    )
  );

-- =====================================================================
-- 7. VOTES
-- =====================================================================
create table public.votes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  day_number int not null,
  voter_id uuid not null references public.game_players(id) on delete cascade,
  target_id uuid references public.game_players(id),
  created_at timestamptz not null default now(),
  unique (session_id, day_number, voter_id)
);

alter table public.votes enable row level security;

create policy "Ai trong ván cũng xem được phiếu bầu (công khai)"
  on public.votes for select
  using (
    exists (
      select 1 from public.game_players gp
      where gp.session_id = votes.session_id
        and gp.profile_id = auth.uid()
    )
  );

create policy "Chỉ người còn sống được bỏ phiếu"
  on public.votes for insert
  with check (
    exists (
      select 1 from public.game_players gp
      where gp.id = votes.voter_id
        and gp.profile_id = auth.uid()
        and gp.is_alive = true
    )
  );

create policy "Được sửa phiếu của mình"
  on public.votes for update
  using (
    exists (
      select 1 from public.game_players gp
      where gp.id = votes.voter_id
        and gp.profile_id = auth.uid()
    )
  );

-- =====================================================================
-- 8. CHAT_MESSAGES
-- =====================================================================
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  channel text not null check (channel in ('public', 'wolves', 'ghost')),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.chat_messages enable row level security;

create policy "Đọc chat theo đúng kênh được phép"
  on public.chat_messages for select
  using (
    case chat_messages.channel
      when 'public' then exists (
        select 1 from public.game_players gp
        where gp.session_id = chat_messages.session_id
          and gp.profile_id = auth.uid()
      )
      when 'wolves' then exists (
        select 1 from public.game_players gp
        where gp.session_id = chat_messages.session_id
          and gp.profile_id = auth.uid()
          and gp.role = 'wolf'
      )
      when 'ghost' then exists (
        select 1 from public.game_players gp
        where gp.session_id = chat_messages.session_id
          and gp.profile_id = auth.uid()
          and gp.is_alive = false
      )
      else false
    end
  );

create policy "Chỉ gửi chat đúng kênh mình có quyền"
  on public.chat_messages for insert
  with check (
    sender_id = auth.uid()
    and (
      chat_messages.channel = 'public'
      or (chat_messages.channel = 'wolves' and exists (
        select 1 from public.game_players gp
        where gp.session_id = chat_messages.session_id
          and gp.profile_id = auth.uid()
          and gp.role = 'wolf'
          and gp.is_alive = true
      ))
      or (chat_messages.channel = 'ghost' and exists (
        select 1 from public.game_players gp
        where gp.session_id = chat_messages.session_id
          and gp.profile_id = auth.uid()
          and gp.is_alive = false
      ))
    )
  );

-- =====================================================================
-- 9. RPC FUNCTIONS
-- =====================================================================

-- 9.1 Tạo phòng mới
create function public.create_room()
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  new_room public.rooms;
  new_code text;
  tries int := 0;
begin
  loop
    new_code := public.generate_room_code();
    tries := tries + 1;
    exit when not exists (select 1 from public.rooms where code = new_code and status <> 'finished')
       or tries > 10;
  end loop;

  insert into public.rooms (code, host_id)
  values (new_code, auth.uid())
  returning * into new_room;

  insert into public.room_players (room_id, profile_id, is_ready)
  values (new_room.id, auth.uid(), true);

  return new_room;
end;
$$;

-- 9.2 Random gán vai trò
create function public.assign_roles(p_room_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_settings jsonb;
  v_role_pool text[] := '{}';
  v_role text;
  v_count int;
  v_players_count int;
begin
  if not exists (
    select 1 from public.rooms where id = p_room_id and host_id = auth.uid()
  ) then
    raise exception 'Chỉ chủ phòng mới được bắt đầu ván chơi';
  end if;

  select settings into v_settings from public.rooms where id = p_room_id;
  select count(*) into v_players_count from public.room_players where room_id = p_room_id;

  for v_role, v_count in
    select key, value::int from jsonb_each_text(v_settings->'roles')
  loop
    for i in 1..v_count loop
      v_role_pool := array_append(v_role_pool, v_role);
    end loop;
  end loop;

  while array_length(v_role_pool, 1) < v_players_count loop
    v_role_pool := array_append(v_role_pool, 'villager');
  end loop;

  create temporary table tmp_shuffled_roles as
    select unnest(v_role_pool) as role order by random();

  insert into public.game_sessions (room_id, phase, day_number)
  values (p_room_id, 'night_intro', 1)
  returning id into v_session_id;

  insert into public.game_players (session_id, profile_id, role)
  select v_session_id, rp.profile_id, roles.role
  from (
    select profile_id, row_number() over (order by random()) as rn
    from public.room_players
    where room_id = p_room_id
  ) rp
  join (
    select role, row_number() over () as rn
    from tmp_shuffled_roles
  ) roles on roles.rn = rp.rn;

  drop table tmp_shuffled_roles;

  update public.rooms set status = 'playing' where id = p_room_id;

  return v_session_id;
end;
$$;

-- 9.3 Submit hành động ban đêm
create function public.submit_night_action(
  p_session_id uuid,
  p_action_type text,
  p_target_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.game_players;
  v_target public.game_players;
  v_day int;
begin
  select * into v_actor
  from public.game_players
  where session_id = p_session_id and profile_id = auth.uid();

  if v_actor.id is null or v_actor.is_alive = false then
    raise exception 'Bạn không thể thực hiện hành động này';
  end if;

  select * into v_target
  from public.game_players
  where session_id = p_session_id and profile_id = p_target_profile_id;

  select day_number into v_day from public.game_sessions where id = p_session_id;

  insert into public.night_actions (session_id, day_number, actor_id, action_type, target_id)
  values (p_session_id, v_day, v_actor.id, p_action_type, v_target.id)
  on conflict (session_id, day_number, actor_id, action_type)
  do update set target_id = excluded.target_id;
end;
$$;

-- 9.4 Xử lý kết quả đêm
create function public.resolve_night(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day int;
  v_kill_target uuid;
  v_saved boolean := false;
  v_protected_target uuid;
begin
  select day_number into v_day from public.game_sessions where id = p_session_id;

  select target_id into v_kill_target
  from public.night_actions
  where session_id = p_session_id and day_number = v_day and action_type = 'kill'
  group by target_id
  order by count(*) desc
  limit 1;

  select target_id into v_protected_target
  from public.night_actions
  where session_id = p_session_id and day_number = v_day and action_type = 'protect'
  limit 1;

  select exists (
    select 1 from public.night_actions
    where session_id = p_session_id and day_number = v_day
      and action_type = 'save' and target_id = v_kill_target
  ) into v_saved;

  if v_kill_target is not null
     and v_kill_target is distinct from v_protected_target
     and not v_saved then
    update public.game_players
    set is_alive = false, died_at_phase = 'night', died_at_day = v_day
    where id = v_kill_target;

    update public.game_players lover
    set is_alive = false, died_at_phase = 'night_lover', died_at_day = v_day
    from public.game_players victim
    where victim.id = v_kill_target
      and lover.id = victim.lover_id
      and lover.is_alive = true;
  end if;

  update public.game_sessions
  set phase = 'day_result', phase_ends_at = null
  where id = p_session_id;

  perform public.check_win_condition(p_session_id);
end;
$$;

-- 9.5 Xử lý kết quả bỏ phiếu
create function public.resolve_vote(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day int;
  v_hanged uuid;
  v_top_count int;
  v_second_count int;
begin
  select day_number into v_day from public.game_sessions where id = p_session_id;

  with tally as (
    select target_id, count(*) as c
    from public.votes
    where session_id = p_session_id and day_number = v_day and target_id is not null
    group by target_id
    order by c desc
  )
  select target_id, c into v_hanged, v_top_count from tally limit 1;

  select c into v_second_count from (
    select target_id, count(*) as c
    from public.votes
    where session_id = p_session_id and day_number = v_day and target_id is not null
    group by target_id
    order by c desc
    offset 1 limit 1
  ) t;

  if v_top_count is not null and v_top_count = coalesce(v_second_count, -1) then
    v_hanged := null;
  end if;

  if v_hanged is not null then
    update public.game_players
    set is_alive = false, died_at_phase = 'day_vote', died_at_day = v_day
    where id = v_hanged;

    update public.game_players lover
    set is_alive = false, died_at_phase = 'day_vote_lover', died_at_day = v_day
    from public.game_players victim
    where victim.id = v_hanged
      and lover.id = victim.lover_id
      and lover.is_alive = true;
  end if;

  update public.game_sessions
  set phase = 'day_vote_result', phase_ends_at = null
  where id = p_session_id;

  perform public.check_win_condition(p_session_id);
end;
$$;

-- 9.6 Kiểm tra điều kiện thắng
create function public.check_win_condition(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wolves_alive int;
  v_villagers_alive int;
  v_winner text;
begin
  select count(*) filter (where role = 'wolf' and is_alive),
         count(*) filter (where role <> 'wolf' and is_alive)
  into v_wolves_alive, v_villagers_alive
  from public.game_players
  where session_id = p_session_id;

  if v_wolves_alive = 0 then
    v_winner := 'villagers';
  elsif v_wolves_alive >= v_villagers_alive then
    v_winner := 'wolves';
  end if;

  if v_winner is not null then
    update public.game_sessions
    set phase = 'game_over', winner = v_winner, ended_at = now()
    where id = p_session_id;

    update public.rooms
    set status = 'finished'
    where id = (select room_id from public.game_sessions where id = p_session_id);

    update public.profiles p
    set wins = wins + 1
    from public.game_players gp
    where gp.session_id = p_session_id
      and gp.profile_id = p.id
      and (
        (v_winner = 'wolves' and gp.role = 'wolf')
        or (v_winner = 'villagers' and gp.role <> 'wolf')
      );

    update public.profiles p
    set losses = losses + 1
    from public.game_players gp
    where gp.session_id = p_session_id
      and gp.profile_id = p.id
      and not (
        (v_winner = 'wolves' and gp.role = 'wolf')
        or (v_winner = 'villagers' and gp.role <> 'wolf')
      );
  end if;
end;
$$;

-- 9.7 Chuyển pha
create function public.advance_phase(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
  v_day int;
begin
  select phase, day_number into v_current, v_day
  from public.game_sessions where id = p_session_id;

  if v_current = 'night_intro' then
    update public.game_sessions
    set phase = 'night_actions', phase_ends_at = now() + interval '45 seconds'
    where id = p_session_id;

  elsif v_current = 'night_actions' then
    perform public.resolve_night(p_session_id);

  elsif v_current = 'day_result' then
    update public.game_sessions
    set phase = 'day_discussion', phase_ends_at = now() + interval '90 seconds'
    where id = p_session_id;

  elsif v_current = 'day_discussion' then
    update public.game_sessions
    set phase = 'day_vote', phase_ends_at = now() + interval '30 seconds'
    where id = p_session_id;

  elsif v_current = 'day_vote' then
    perform public.resolve_vote(p_session_id);

  elsif v_current = 'day_vote_result' then
    update public.game_sessions
    set phase = 'night_intro', day_number = v_day + 1, phase_ends_at = now() + interval '5 seconds'
    where id = p_session_id
      and not exists (
        select 1 from public.game_sessions where id = p_session_id and phase = 'game_over'
      );
  end if;
end;
$$;

-- 9.8 Kiểm tra vai trò (dành riêng cho Tiên Tri soi bài)
create function public.check_player_role(
  p_session_id uuid,
  p_target_profile_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller public.game_players;
  v_target public.game_players;
  v_has_checked boolean;
  v_day int;
begin
  select * into v_caller
  from public.game_players
  where session_id = p_session_id and profile_id = auth.uid();

  if v_caller.id is null or v_caller.role <> 'seer' or v_caller.is_alive = false then
    raise exception 'Chỉ Tiên tri còn sống mới được thực hiện hành động này';
  end if;

  select day_number into v_day from public.game_sessions where id = p_session_id;

  select exists (
    select 1 from public.night_actions
    where session_id = p_session_id
      and day_number = v_day
      and actor_id = v_caller.id
      and action_type = 'check'
      and target_id = (select id from public.game_players where session_id = p_session_id and profile_id = p_target_profile_id)
  ) into v_has_checked;

  if not v_has_checked then
    raise exception 'Bạn chưa thực hiện soi người chơi này đêm nay';
  end if;

  select * into v_target
  from public.game_players
  where session_id = p_session_id and profile_id = p_target_profile_id;

  if v_target.role = 'wolf' then
    return 'wolf';
  else
    return 'villager';
  end if;
end;
$$;

-- =====================================================================
-- 10. REALTIME PUBLICATION
-- =====================================================================
alter publication supabase_realtime add table
  public.room_players,
  public.game_sessions,
  public.game_players,
  public.votes,
  public.chat_messages;

-- =====================================================================
-- 11. INDEXES
-- =====================================================================
create index idx_room_players_room on public.room_players(room_id);
create index idx_game_players_session on public.game_players(session_id);
create index idx_night_actions_session_day on public.night_actions(session_id, day_number);
create index idx_votes_session_day on public.votes(session_id, day_number);
create index idx_chat_session_channel on public.chat_messages(session_id, channel, created_at);
create index idx_rooms_code on public.rooms(code);
