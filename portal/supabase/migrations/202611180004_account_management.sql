begin;

alter table public.portal_profiles add column if not exists approved_at timestamptz;
alter table public.portal_profiles add column if not exists former_telegram_id text;
alter table public.portal_profiles alter column telegram_id drop not null;

create or replace function public.portal_require_active_session() returns trigger language plpgsql set search_path = '' as $$
begin
  perform 1 from public.portal_profiles where id = new.profile_id and active for update;
  if not found then raise exception 'profile is inactive'; end if;
  return new;
end;
$$;
drop trigger if exists portal_require_active_session on public.portal_sessions;
create trigger portal_require_active_session before insert on public.portal_sessions
for each row execute function public.portal_require_active_session();

create or replace function public.portal_record_approval() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.review_status = 'approved' and old.review_status is distinct from 'approved' then
    new.approved_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists portal_record_approval on public.portal_profiles;
create trigger portal_record_approval before update of review_status on public.portal_profiles
for each row execute function public.portal_record_approval();

create table if not exists public.portal_account_actions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.portal_profiles(id) on delete cascade,
  actor_chat text not null,
  operation text not null check (operation in ('withdraw', 'enable', 'disable', 'purge')),
  reason text not null check (char_length(reason) <= 600),
  expires_at timestamptz not null,
  unique(profile_id, actor_chat, operation)
);
alter table public.portal_account_actions enable row level security;
revoke all on public.portal_account_actions from public, anon, authenticated;
grant select, insert, update, delete on public.portal_account_actions to service_role;

-- Retain a teacher's quiz after its final recipient is removed.
alter table public.portal_quizzes drop constraint if exists portal_quizzes_audience_check;
alter table public.portal_quizzes add constraint portal_quizzes_audience_check check (cardinality(audience) <= 100);

create or replace function public.portal_clean_deleted_profile() returns trigger language plpgsql set search_path = '' as $$
begin
  update public.portal_quizzes set audience = array_remove(audience, old.username) where old.username = any(audience);
  delete from public.portal_week_subscriptions where chat_id = old.telegram_id;
  delete from public.portal_admin_user_lists where chat_id = old.telegram_id;
  delete from public.portal_invites where telegram_id = old.telegram_id or student_number = old.student_number;
  return old;
end;
$$;
drop trigger if exists portal_clean_deleted_profile on public.portal_profiles;
create trigger portal_clean_deleted_profile before delete on public.portal_profiles
for each row execute function public.portal_clean_deleted_profile();

create or replace function public.portal_auth_email(p_username text) returns text
language sql security definer set search_path = '' as $$
  select u.email from public.portal_profiles p join auth.users u on p.id = u.id where p.username = p_username;
$$;

create or replace function public.portal_edit_profile(p_id uuid, p_chat text, p_values jsonb) returns boolean
language plpgsql set search_path = '' as $$
declare previous text; next_name text := p_values->>'username';
begin
  select username into previous from public.portal_profiles where id = p_id and active and telegram_id = p_chat for update;
  if not found then return false; end if;
  update public.portal_profiles set username = next_name, first_name = p_values->>'first_name',
    last_name = p_values->>'last_name', phone = p_values->>'phone',
    birth_date = (p_values->>'birth_date')::date, student_number = p_values->>'student_number',
    course_name = p_values->>'course_name' where id = p_id;
  if previous is distinct from next_name then
    update public.portal_quizzes set audience = array_replace(audience, previous, next_name) where previous = any(audience);
  end if;
  return true;
end;
$$;

create or replace function public.portal_decide_account_action(p_request uuid, p_accept boolean, p_protected text[]) returns text
language plpgsql security definer set search_path = '' as $$
declare task public.portal_account_actions; target public.portal_profiles;
begin
  select * into task from public.portal_account_actions where id = p_request and expires_at > now() for update;
  if not found then return 'gone'; end if;
  if not p_accept then
    delete from public.portal_account_actions where id = p_request;
    return 'cancelled';
  end if;

  select * into target from public.portal_profiles where id = task.profile_id for update;
  if not found or target.telegram_id = any(p_protected) then return 'protected'; end if;
  if task.operation = 'withdraw' and (not target.active or target.telegram_id is distinct from task.actor_chat) then return 'gone'; end if;
  if task.operation = 'purge' then
    delete from auth.users where id = target.id;
    if not found then raise exception 'account missing in auth.users'; end if;
    return 'purge';
  end if;
  if task.operation = 'enable' then
    update public.portal_profiles set active = true, review_status = 'approved' where id = target.id;
  else
    update public.portal_profiles set active = false,
      former_telegram_id = case when task.operation = 'withdraw' then telegram_id else former_telegram_id end,
      telegram_id = case when task.operation = 'withdraw' then null else telegram_id end where id = target.id;
    delete from public.portal_sessions where profile_id = target.id;
    delete from public.portal_tickets where profile_id = target.id;
    update public.portal_week_subscriptions set enabled = false where chat_id = target.telegram_id;
  end if;
  delete from public.portal_account_actions where id = p_request;
  return task.operation;
end;
$$;

revoke execute on function public.portal_auth_email(text), public.portal_edit_profile(uuid,text,jsonb),
  public.portal_decide_account_action(uuid,boolean,text[]) from public, anon, authenticated;
grant execute on function public.portal_auth_email(text), public.portal_edit_profile(uuid,text,jsonb),
  public.portal_decide_account_action(uuid,boolean,text[]) to service_role;

commit;
