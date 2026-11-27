begin;

create table if not exists public.portal_uniludo_matches (
  profile_id uuid primary key references public.portal_profiles(id) on delete cascade,
  id uuid not null unique default gen_random_uuid(),
  revision integer not null default 0 check (revision >= 0),
  state jsonb not null check (
    jsonb_typeof(state) = 'object' and pg_column_size(state) <= 20000
    and coalesce(state->>'phase', '') in ('awaiting_roll', 'awaiting_move', 'finished')
  )
);

create table if not exists public.portal_uniludo_scores (
  profile_id uuid primary key references public.portal_profiles(id) on delete cascade,
  points integer not null default 0 check (points >= 0),
  games integer not null default 0 check (games >= 0),
  wins integer not null default 0 check (wins between 0 and games)
);

create index if not exists portal_uniludo_score_order
  on public.portal_uniludo_scores (points desc, wins desc, profile_id);

alter table public.portal_uniludo_matches enable row level security;
alter table public.portal_uniludo_scores enable row level security;
revoke all on public.portal_uniludo_matches, public.portal_uniludo_scores from public, anon, authenticated;
grant select, insert, update on public.portal_uniludo_matches, public.portal_uniludo_scores to service_role;

create or replace function public.portal_uniludo_start(p_profile uuid, p_state jsonb, p_replace uuid, p_revision integer)
returns public.portal_uniludo_matches
language plpgsql set search_path = '' as $$
declare
  match public.portal_uniludo_matches;
begin
  insert into public.portal_uniludo_matches as previous (profile_id, state)
  select p_profile, p_state
  where exists (select 1 from public.portal_profiles p where p.id = p_profile and p.active)
  on conflict (profile_id) do update
    set id = excluded.id, revision = 0, state = excluded.state
    where previous.state->>'phase' = 'finished'
      or (previous.id = p_replace and previous.revision = p_revision)
  returning * into match;
  if match.id is null then
    select * into match from public.portal_uniludo_matches m
      where m.profile_id = p_profile
        and exists (select 1 from public.portal_profiles p where p.id = p_profile and p.active);
  end if;
  return match;
end;
$$;

create or replace function public.portal_uniludo_move(p_profile uuid, p_match uuid, p_revision integer, p_state jsonb)
returns public.portal_uniludo_matches
language plpgsql set search_path = '' as $$
declare
  match public.portal_uniludo_matches;
  win integer;
begin
  update public.portal_uniludo_matches m set state = p_state, revision = m.revision + 1
    where m.profile_id = p_profile and m.id = p_match and m.revision = p_revision
      and m.state->>'phase' <> 'finished'
      and exists (select 1 from public.portal_profiles p where p.id = p_profile and p.active)
    returning m.* into match;
  if match.id is not null and match.state->>'phase' = 'finished' then
    win := case when match.state->>'winnerId' = '0' then 1 else 0 end;
    insert into public.portal_uniludo_scores as score (profile_id, points, games, wins)
      values (p_profile, 3 * win, 1, win)
      on conflict (profile_id) do update set
        points = score.points + excluded.points, games = score.games + 1, wins = score.wins + excluded.wins;
  end if;
  return match;
end;
$$;

create or replace function public.portal_uniludo_ranking(p_profile uuid)
returns table(rank bigint, username text, points integer, games integer, wins integer, mine boolean)
language sql stable set search_path = '' as $$
  with ranked as (
    select s.profile_id, p.username, s.points, s.games, s.wins,
      rank() over (order by s.points desc) as place,
      row_number() over (order by s.points desc, s.wins desc, s.profile_id) as row_number
    from public.portal_uniludo_scores s
    join public.portal_profiles p on p.id = s.profile_id and p.active
  )
  select r.place, r.username::text, r.points, r.games, r.wins, r.profile_id = p_profile
  from ranked r
  where r.row_number <= 50 or r.profile_id = p_profile
  order by r.row_number;
$$;

revoke all on function public.portal_uniludo_start(uuid, jsonb, uuid, integer),
  public.portal_uniludo_move(uuid, uuid, integer, jsonb), public.portal_uniludo_ranking(uuid) from public, anon, authenticated;
grant execute on function public.portal_uniludo_start(uuid, jsonb, uuid, integer),
  public.portal_uniludo_move(uuid, uuid, integer, jsonb), public.portal_uniludo_ranking(uuid) to service_role;

commit;
