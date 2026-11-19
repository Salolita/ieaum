begin;

alter table public.erae_rooms add column expires_at timestamptz;
create index erae_rooms_expiry on public.erae_rooms(expires_at) where expires_at is not null;

create table public.erae_replacement_images (
  room_id uuid references public.erae_rooms(id) on delete cascade not null,
  batch_id uuid not null,
  page int not null check (page between 1 and 40),
  jpeg bytea not null check (octet_length(jpeg) between 4 and 550000),
  created_at timestamptz not null default now(),
  primary key (room_id, batch_id, page)
);
alter table public.erae_replacement_images enable row level security;
revoke all on public.erae_replacement_images from anon, authenticated;
grant select, insert, update, delete on public.erae_replacement_images to service_role;

create function public.erae_replace_slides(p_owner uuid, p_room uuid, p_batch uuid, p_count int)
returns boolean language plpgsql set search_path = '' as $$
declare room public.erae_rooms;
begin
  select * into room from public.erae_rooms where id = p_room and owner_id = p_owner
    and (expires_at is null or expires_at > now()) for update;
  if not found or (room.body->>'furthest')::int >= 0 or room.page_count <> p_count then return false; end if;
  if (select count(*) from public.erae_replacement_images where room_id = p_room and batch_id = p_batch and page <= p_count) <> p_count then return false; end if;
  insert into public.erae_images(room_id,page,jpeg)
  select room_id, page, jpeg from public.erae_replacement_images where room_id = p_room and batch_id = p_batch and page <= p_count
  on conflict (room_id,page) do update set jpeg = excluded.jpeg;
  delete from public.erae_replacement_images where room_id = p_room and batch_id = p_batch;
  update public.erae_rooms set revision = revision + 1 where id = p_room;
  return true;
end;
$$;
revoke execute on function public.erae_replace_slides(uuid,uuid,uuid,int) from public, anon, authenticated;
grant execute on function public.erae_replace_slides(uuid,uuid,uuid,int) to service_role;

create or replace function public.erae_create_room(p_owner uuid, p_title text, p_caption text, p_page_count int, p_join text, p_admin text, p_days int)
returns uuid language plpgsql set search_path = '' as $$
declare created uuid;
begin
  if p_days is not null and p_days not in (3, 5) then raise exception 'invalid retention'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text, 0));
  if (select count(*) from public.erae_rooms where owner_id = p_owner and (expires_at is null or expires_at > now())) >= 3 then return null; end if;
  insert into public.erae_rooms (owner_id, title, caption, page_count, join_code, admin_digest, expires_at)
  values (p_owner, p_title, p_caption, p_page_count, p_join, p_admin, now() + p_days * interval '24 hours') returning id into created;
  return created;
end;
$$;

create or replace function public.erae_create_room(p_owner uuid, p_title text, p_caption text, p_page_count int, p_join text, p_admin text)
returns uuid language sql set search_path = '' as $$
  select public.erae_create_room(p_owner, p_title, p_caption, p_page_count, p_join, p_admin, null);
$$;
revoke execute on function public.erae_create_room(uuid,text,text,int,text,text,int) from public, anon, authenticated;
grant execute on function public.erae_create_room(uuid,text,text,int,text,text,int) to service_role;

create or replace function public.portal_open_session(p_ticket text, p_user uuid, p_session text)
returns boolean language plpgsql set search_path = '' as $$
begin
  perform 1 from public.portal_profiles where id = p_user and active for update;
  if not found then return false; end if;
  delete from public.portal_tickets t using public.portal_profiles p
  where t.token_hash = p_ticket and t.profile_id = p_user and p.id = p_user and t.expires_at > now()
    and p.telegram_id is not distinct from nullif(t.telegram_id, '');
  if not found then return false; end if;
  insert into public.portal_sessions(token_hash, profile_id) values (p_session, p_user);
  return true;
end;
$$;

alter table public.portal_week_subscriptions
  add column weekday int not null default 6 check (weekday between 0 and 6),
  add column minute_of_day int not null default 360 check (minute_of_day between 0 and 1439);

create function public.portal_due_weeks(p_now timestamptz)
returns table(chat_id text, week_date date, is_odd boolean, upcoming boolean)
language sql stable set search_path = '' as $$
  with clock as (select p_now at time zone 'Asia/Tehran' as local_time),
  due as (
    select s.chat_id, a.anchor, a.odd, s.last_week, s.weekday,
      (clock.local_time::date + s.minute_of_day * interval '1 minute') as moment,
      (clock.local_time::date + case when s.weekday = 5 then 1 else 0 end) as reference_date,
      clock.local_time
    from public.portal_week_subscriptions s cross join clock cross join public.portal_week_schedule a
    where s.enabled and s.weekday = extract(dow from clock.local_time) and (s.lease_until is null or s.lease_until <= p_now)
  ), dated as (
    select *, (reference_date - anchor) / 7 as weeks from due
    where reference_date >= anchor and local_time >= moment and local_time < moment + interval '1 hour'
  )
  select chat_id, anchor + weeks * 7, case when weeks % 2 = 0 then odd else not odd end, weekday = 5
  from dated where last_week is distinct from anchor + weeks * 7;
$$;

create function public.portal_claim_due_weeks(p_count int)
returns table(chat_id text, week_date date, is_odd boolean, upcoming boolean)
language sql set search_path = '' as $$
  with batch as (
    select d.* from public.portal_due_weeks(now()) d join public.portal_week_subscriptions s using(chat_id)
    where s.enabled and (s.lease_until is null or s.lease_until <= now()) and s.last_week is distinct from d.week_date
    order by d.chat_id limit least(greatest(p_count, 1), 100) for update of s skip locked
  )
  update public.portal_week_subscriptions s set lease_until = now() + interval '5 minutes'
  from batch b where s.chat_id = b.chat_id returning b.*;
$$;
revoke execute on function public.portal_due_weeks(timestamptz), public.portal_claim_due_weeks(int) from public, anon, authenticated;
grant execute on function public.portal_due_weeks(timestamptz), public.portal_claim_due_weeks(int) to service_role;

commit;
