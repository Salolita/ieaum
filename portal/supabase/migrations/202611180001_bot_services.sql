begin;

alter table public.portal_profiles add column last_portal_login_at timestamptz;
update public.portal_profiles p set last_portal_login_at = s.login_at
from (select profile_id, max(expires_at) - interval '30 days' as login_at from public.portal_sessions group by profile_id) s
where p.id = s.profile_id;

create function public.portal_record_login() returns trigger language plpgsql set search_path = '' as $$
begin
  update public.portal_profiles set last_portal_login_at = now() where id = new.profile_id and active;
  return new;
end;
$$;
create trigger portal_record_login after insert on public.portal_sessions
for each row execute function public.portal_record_login();

create table public.portal_admin_user_lists (
  chat_id text primary key,
  profile_ids uuid[] not null,
  expires_at timestamptz not null default (now() + interval '15 minutes')
);

create table public.portal_week_schedule (
  id int primary key check (id = 1),
  anchor date not null,
  odd boolean not null
);
insert into public.portal_week_schedule values (1, date '2026-11-21', true);

create table public.portal_week_subscriptions (
  chat_id text primary key check (chat_id ~ '^[1-9][0-9]{0,15}$'),
  enabled boolean not null default true,
  last_week date,
  lease_until timestamptz
);

create function public.portal_remove_user(p_id uuid) returns boolean language plpgsql set search_path = '' as $$
declare chat text;
begin
  update public.portal_profiles set active = false where id = p_id and active and last_portal_login_at is not null returning telegram_id into chat;
  if not found then return false; end if;
  delete from public.portal_sessions where profile_id = p_id;
  delete from public.portal_tickets where profile_id = p_id;
  update public.portal_week_subscriptions set enabled = false where chat_id = chat;
  return true;
end;
$$;

create function public.portal_claim_week(p_week date, p_count int) returns table(chat_id text)
language sql set search_path = '' as $$
  with batch as (
    select s.chat_id from public.portal_week_subscriptions s
    where s.enabled and (s.last_week is null or s.last_week < p_week) and (s.lease_until is null or s.lease_until < now())
    order by s.chat_id limit least(greatest(p_count, 1), 100) for update skip locked
  )
  update public.portal_week_subscriptions s set lease_until = now() + interval '5 minutes'
  from batch where s.chat_id = batch.chat_id returning s.chat_id;
$$;

alter table public.portal_admin_user_lists enable row level security;
alter table public.portal_week_schedule enable row level security;
alter table public.portal_week_subscriptions enable row level security;
revoke all on public.portal_admin_user_lists, public.portal_week_schedule, public.portal_week_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.portal_admin_user_lists, public.portal_week_schedule, public.portal_week_subscriptions to service_role;
revoke execute on function public.portal_remove_user(uuid), public.portal_claim_week(date,int) from public, anon, authenticated;
grant execute on function public.portal_remove_user(uuid), public.portal_claim_week(date,int) to service_role;

commit;
