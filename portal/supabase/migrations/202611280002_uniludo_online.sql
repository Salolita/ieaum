begin;

create table if not exists public.portal_uniludo_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.portal_profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  capacity int not null check (capacity between 2 and 4),
  mode text not null check (mode in ('casual','ranked')),
  status text not null default 'waiting' check (status in ('waiting','playing','finished','closed')),
  touched_at timestamptz not null default now(),
  revision int not null default 0,
  state jsonb check (state is null or pg_column_size(state) <= 20000)
);
create unique index if not exists portal_uniludo_one_open_room on public.portal_uniludo_rooms(owner_id)
  where status in ('waiting','playing');
create index if not exists portal_uniludo_active_rooms on public.portal_uniludo_rooms(touched_at desc)
  where status in ('waiting','playing');
create table if not exists public.portal_uniludo_room_players (
  room_id uuid references public.portal_uniludo_rooms(id) on delete cascade,
  profile_id uuid references public.portal_profiles(id) on delete cascade,
  team text not null check (team in ('optimization','projects','analytics','production')),
  seen_at timestamptz not null default now(),
  primary key (room_id, profile_id),
  unique (room_id, team)
);
create table if not exists public.portal_uniludo_room_results (
  room_id uuid references public.portal_uniludo_rooms(id) on delete cascade,
  profile_id uuid references public.portal_profiles(id) on delete cascade,
  username text not null,
  student_number text,
  place int not null check (place between 1 and 4),
  points int not null check (points in (0,5,10,15)),
  completed_at timestamptz not null default now(),
  primary key (room_id, profile_id),
  unique (room_id, place)
);
alter table public.portal_uniludo_rooms enable row level security;
alter table public.portal_uniludo_room_players enable row level security;
alter table public.portal_uniludo_room_results enable row level security;
revoke all on public.portal_uniludo_rooms, public.portal_uniludo_room_players, public.portal_uniludo_room_results from public, anon, authenticated;

create or replace function public.portal_uniludo_lobbies(p_profile uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(v) - 'touched_at' order by v.owner desc, v.joined desc, v.touched_at desc),'[]'::jsonb)
  from (
    select r.id,r.title,r.capacity,r.mode,r.status,r.touched_at,
      r.owner_id = p_profile as owner,
      count(m.profile_id)::int as count,
      coalesce(bool_or(m.profile_id = p_profile),false) as joined
    from public.portal_uniludo_rooms r
    left join public.portal_uniludo_room_players m on m.room_id = r.id
      and (r.status = 'playing' or m.seen_at > now() - interval '40 seconds')
    where r.status in ('waiting','playing') and r.touched_at > now() - interval '5 minutes'
    group by r.id
    order by owner desc, joined desc, r.touched_at desc limit 60
  ) v;
$$;

create or replace function public.portal_uniludo_room(p_profile uuid, p_room uuid, p_action text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.portal_uniludo_rooms;
  my_team text;
  players jsonb;
  game jsonb;
  member_count int;
  occupied_count int;
  stamp timestamptz := now();
begin
  if not exists(select 1 from public.portal_profiles p where p.id = p_profile and p.active and p.role = 'student') then
    return jsonb_build_object('error','دانشجوی دارای حساب فعال می‌تواند در این بخش بازی کند.');
  end if;
  if p_action = 'create' then
    perform pg_advisory_xact_lock(hashtextextended(p_profile::text, 831));
    update public.portal_uniludo_rooms set status = 'closed'
      where owner_id = p_profile and status in ('waiting','playing') and touched_at <= stamp - interval '5 minutes';
    select * into r from public.portal_uniludo_rooms where owner_id = p_profile and status in ('waiting','playing');
    if r.id is not null then return jsonb_build_object('error','شما یک جلسهٔ باز دارید.','id',r.id); end if;
    insert into public.portal_uniludo_rooms(owner_id,title,capacity,mode)
      values(p_profile,p_data->>'title',(p_data->>'capacity')::int,p_data->>'mode') returning * into r;
  else
    select * into r from public.portal_uniludo_rooms where id = p_room for update;
    if r.id is null then return jsonb_build_object('error','جلسه پیدا نشد.'); end if;
    if r.status in ('waiting','playing') and r.touched_at <= stamp - interval '5 minutes' then
      update public.portal_uniludo_rooms set status = 'closed' where id = r.id returning * into r;
    end if;
  end if;
  if r.status = 'closed' then return jsonb_build_object('error','این جلسه بسته شده است.'); end if;

  if r.status = 'waiting' then
    delete from public.portal_uniludo_room_players m where m.room_id = r.id and
      (m.seen_at <= stamp - interval '40 seconds' or not exists (
        select 1 from public.portal_profiles p where p.id = m.profile_id and p.active and p.role = 'student'));
    if found then
      update public.portal_uniludo_rooms set revision = revision + 1 where id = r.id returning * into r;
    end if;
  end if;
  select m.team into my_team from public.portal_uniludo_room_players m where m.room_id = r.id and m.profile_id = p_profile;
  if p_action in ('rename','delete','start','reset') and r.owner_id <> p_profile then
    return jsonb_build_object('error','این گزینه در اختیار مدیر جلسه است.');
  end if;
  if p_action = 'join' then
    if r.status <> 'waiting' then return jsonb_build_object('error','این بازی شروع شده است.'); end if;
    select count(*) into occupied_count from public.portal_uniludo_room_players m where m.room_id = r.id and m.profile_id <> p_profile;
    if occupied_count >= r.capacity then return jsonb_build_object('error','ظرفیت جلسه تکمیل شده است.'); end if;
    if exists (select 1 from public.portal_uniludo_room_players m where m.room_id = r.id
      and m.team = p_data->>'team' and m.profile_id <> p_profile) then
      return jsonb_build_object('error','این نقش انتخاب شده است. نقش دیگری بردارید.');
    end if;
    insert into public.portal_uniludo_room_players(room_id,profile_id,team,seen_at)
      values(r.id,p_profile,p_data->>'team',stamp)
      on conflict(room_id,profile_id) do update set team = excluded.team, seen_at = excluded.seen_at
      returning team into my_team;
    update public.portal_uniludo_rooms set revision = revision + 1 where id = r.id returning * into r;
  elsif p_action = 'leave' then
    if r.status = 'waiting' then
      delete from public.portal_uniludo_room_players where room_id = r.id and profile_id = p_profile;
      if found then update public.portal_uniludo_rooms set revision = revision + 1 where id = r.id; end if;
    end if;
    return jsonb_build_object('ok',true);
  elsif p_action = 'delete' then
    if r.status = 'finished' then return jsonb_build_object('error','این بازی به پایان رسیده است.'); end if;
    update public.portal_uniludo_rooms set status = 'closed' where id = r.id;
    return jsonb_build_object('ok',true);
  elsif p_action = 'rename' then
    if r.status = 'finished' then return jsonb_build_object('error','این بازی به پایان رسیده است.'); end if;
    update public.portal_uniludo_rooms set title = p_data->>'title', revision = revision + 1 where id = r.id returning * into r;
  end if;

  select count(*), coalesce(jsonb_agg(jsonb_build_object(
      'team',m.team,'name',trim(concat_ws(' ',p.first_name,p.last_name))) order by m.team),'[]'::jsonb)
    into member_count, players
    from public.portal_uniludo_room_players m join public.portal_profiles p on p.id = m.profile_id
    where m.room_id = r.id;
  if p_action in ('start','reset','play') then
    if (p_data->>'revision')::int is distinct from r.revision then
      return jsonb_build_object('error','وضعیت بازی تغییر کرده است. دوباره تلاش کنید.');
    end if;
    game := p_data->'state';
    if p_action in ('start','reset') then
      if (p_action = 'start' and (r.status <> 'waiting' or member_count <> r.capacity))
        or (p_action = 'reset' and r.status <> 'playing')
        or (select array_agg(m.team order by m.team) from public.portal_uniludo_room_players m where m.room_id = r.id)
            is distinct from (select array_agg(j->>'teamId' order by j->>'teamId') from jsonb_array_elements(game->'players') j) then
        return jsonb_build_object('error','بازیکنان یا وضعیت جلسه تغییر کرده‌اند.');
      end if;
    elsif r.status <> 'playing' or my_team is null or my_team is distinct from
        ((r.state->'players')->((r.state->>'activePlayerIndex')::int)->>'teamId') then
      return jsonb_build_object('error','نوبت شما نیست.');
    end if;
    update public.portal_uniludo_rooms set state = game, revision = revision + 1,
      status = case when game->>'phase' = 'finished' then 'finished' else 'playing' end where id = r.id returning * into r;
    if r.status = 'finished' and r.mode = 'ranked' then
      with results as (
        insert into public.portal_uniludo_room_results(room_id,profile_id,username,student_number,place,points)
        select r.id,m.profile_id,p.username,p.student_number,(j->>'finishRank')::int,
          case j->>'finishRank' when '1' then 15 when '2' then 10 when '3' then 5 else 0 end
        from jsonb_array_elements(game->'players') j
        join public.portal_uniludo_room_players m on m.room_id = r.id and m.team = j->>'teamId'
        join public.portal_profiles p on p.id = m.profile_id
        returning profile_id,place,points
      )
      insert into public.portal_uniludo_scores as s (profile_id,points,games,wins)
        select profile_id,points,1,(place = 1)::int from results order by profile_id
        on conflict(profile_id) do update set points = s.points + excluded.points,
          games = s.games + 1, wins = s.wins + excluded.wins;
    end if;
  end if;
  if my_team is not null or r.owner_id = p_profile then
    update public.portal_uniludo_rooms set touched_at = stamp where id = r.id
      and (p_action <> 'view' or touched_at <= stamp - interval '5 seconds');
    if my_team is not null then
      update public.portal_uniludo_room_players set seen_at = stamp where room_id = r.id and profile_id = p_profile
        and r.status = 'waiting' and (p_action <> 'view' or seen_at <= stamp - interval '5 seconds');
    end if;
  end if;
  return jsonb_build_object('id',r.id,'title',r.title,'capacity',r.capacity,'mode',r.mode,
    'status',r.status,'owner',r.owner_id = p_profile,'joined',my_team is not null,'count',member_count,
    'team',my_team,'members',players,'revision',r.revision,
    'state',case when my_team is not null or r.owner_id = p_profile then r.state else null end);
end;
$$;

-- Keep old Mini App sessions playable during rollout. New scores come from ranked rooms.
create or replace function public.portal_uniludo_move(p_profile uuid, p_match uuid, p_revision integer, p_state jsonb)
returns public.portal_uniludo_matches
language plpgsql set search_path = '' as $$
declare
  match public.portal_uniludo_matches;
begin
  update public.portal_uniludo_matches m set state = p_state, revision = m.revision + 1
    where m.profile_id = p_profile and m.id = p_match and m.revision = p_revision
      and m.state->>'phase' <> 'finished'
      and exists (select 1 from public.portal_profiles p where p.id = p_profile and p.active)
    returning m.* into match;
  return match;
end;
$$;

create or replace function public.portal_uniludo_leaderboard(p_profile uuid, p_sort text)
returns table(rank bigint, name text, points int, games int, wins int, mine bool)
language sql stable security definer set search_path = '' as $$
  with candidates as (
    select s.profile_id, trim(concat_ws(' ',p.first_name,p.last_name)) as name, s.points,s.games,s.wins,
      case p_sort when 'wins' then s.wins when 'games' then s.games else s.points end as value
    from public.portal_uniludo_scores s join public.portal_profiles p on p.id = s.profile_id and p.active
  ), ranked as (
    select *, rank() over(order by value desc) as place,
      row_number() over(order by value desc,points desc,wins desc,games desc,profile_id) as row
    from candidates
  )
  select r.place,r.name,r.points,r.games,r.wins,r.profile_id = p_profile
  from ranked r where r.row <= 50 or r.profile_id = p_profile order by r.row;
$$;

revoke all on function public.portal_uniludo_room(uuid,uuid,text,jsonb), public.portal_uniludo_lobbies(uuid),
  public.portal_uniludo_leaderboard(uuid,text) from public, anon, authenticated;
grant execute on function public.portal_uniludo_room(uuid,uuid,text,jsonb), public.portal_uniludo_lobbies(uuid),
  public.portal_uniludo_leaderboard(uuid,text) to service_role;

do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    perform cron.schedule('ieaum-expire-uniludo-rooms','* * * * *',
      $job$update public.portal_uniludo_rooms set status = 'closed'
      where status in ('waiting','playing') and touched_at <= now() - interval '5 minutes'$job$);
  end if;
end;
$$;

commit;
