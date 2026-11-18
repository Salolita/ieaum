begin;

create table public.portal_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('student', 'teacher')),
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9_.-]{2,31}$'),
  first_name text not null,
  last_name text not null,
  student_number text unique,
  birth_date date,
  telegram_id text not null unique,
  active boolean not null default true,
  check (role = 'teacher' or (student_number ~ '^[0-9]{6,20}$' and student_number is not null and birth_date is not null))
);

create table public.portal_invites (
  code_hash text primary key,
  role text not null check (role in ('student', 'teacher')),
  student_number text unique,
  telegram_id text,
  expires_at timestamptz not null,
  used_at timestamptz,
  check ((role = 'student') = (student_number is not null))
);

create table public.portal_tickets (
  token_hash text primary key,
  telegram_id text not null,
  invite_hash text references public.portal_invites(code_hash) on delete cascade,
  profile_id uuid references public.portal_profiles(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  check ((invite_hash is null) <> (profile_id is null))
);

create table public.portal_sessions (
  token_hash text primary key,
  profile_id uuid not null references public.portal_profiles(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '8 hours')
);

create table public.portal_limits (
  bucket text primary key,
  expires_at timestamptz not null,
  attempts integer not null
);

create table public.portal_quizzes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.portal_profiles(id) on delete cascade,
  title text not null,
  content jsonb not null,
  audience text[] not null check (cardinality(audience) between 1 and 100),
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.portal_submissions (
  quiz_id uuid not null references public.portal_quizzes(id) on delete cascade,
  student_id uuid not null references public.portal_profiles(id) on delete cascade,
  answers jsonb not null,
  score integer not null,
  submitted_at timestamptz not null default now(),
  primary key (quiz_id, student_id)
);

alter table public.portal_profiles enable row level security;
alter table public.portal_invites enable row level security;
alter table public.portal_tickets enable row level security;
alter table public.portal_sessions enable row level security;
alter table public.portal_limits enable row level security;
alter table public.portal_quizzes enable row level security;
alter table public.portal_submissions enable row level security;
revoke all on public.portal_profiles, public.portal_invites, public.portal_tickets, public.portal_sessions,
  public.portal_limits, public.portal_quizzes, public.portal_submissions from anon, authenticated;
grant select, insert, update, delete on public.portal_profiles, public.portal_invites, public.portal_tickets,
  public.portal_sessions, public.portal_limits, public.portal_quizzes, public.portal_submissions to service_role;

create function public.portal_rate_limit(p_bucket text, p_limit int)
returns boolean language sql set search_path = '' as $$
  insert into public.portal_limits as existing (bucket, expires_at, attempts)
  values (p_bucket, now() + interval '15 minutes', 1)
  on conflict (bucket) do update set
    attempts = case when existing.expires_at <= now() then 1 else existing.attempts + 1 end,
    expires_at = case when existing.expires_at <= now() then excluded.expires_at else existing.expires_at end
  returning attempts <= p_limit;
$$;

create function public.portal_claim_invite(p_code text, p_telegram text, p_ticket text)
returns text language plpgsql set search_path = '' as $$
declare invitation public.portal_invites;
begin
  if exists (select 1 from public.portal_profiles where telegram_id = p_telegram) then return null; end if;
  update public.portal_invites set telegram_id = p_telegram
  where code_hash = p_code and used_at is null and expires_at > now()
    and (telegram_id is null or telegram_id = p_telegram)
  returning * into invitation;
  if not found then return null; end if;
  delete from public.portal_tickets where invite_hash = invitation.code_hash;
  insert into public.portal_tickets(token_hash, telegram_id, invite_hash)
  values (p_ticket, p_telegram, invitation.code_hash);
  return invitation.role;
end;
$$;

create function public.portal_issue_invite(p_code text, p_role text, p_number text, p_telegram text)
returns boolean language plpgsql set search_path = '' as $$
begin
  if p_number is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_number, 0));
    perform 1 from public.portal_invites where student_number = p_number for update;
  end if;
  if exists (select 1 from public.portal_profiles where student_number = p_number or telegram_id = p_telegram) then
    return false;
  end if;
  delete from public.portal_invites where student_number = p_number and used_at is null;
  insert into public.portal_invites(code_hash, role, student_number, telegram_id, expires_at)
  values (p_code, p_role, p_number, p_telegram, now() + interval '48 hours')
  on conflict (student_number) do nothing;
  return found;
end;
$$;

-- Supabase Auth creates the user and this trigger consumes the ticket in the same transaction.
-- Only Auth Admin can set app_metadata. Public signup is disabled for this dedicated project.
create function public.portal_create_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare ticket public.portal_tickets;
declare invitation public.portal_invites;
declare profile jsonb := new.raw_app_meta_data -> 'portal_signup';
begin
  if profile is null then return new; end if;
  select * into ticket from public.portal_tickets
  where token_hash = profile ->> 'ticket' and expires_at > now() and invite_hash is not null;
  if not found then raise exception 'Registration unavailable'; end if;
  update public.portal_invites set used_at = now()
  where code_hash = ticket.invite_hash and expires_at > now() and used_at is null and telegram_id = ticket.telegram_id
    and (role = 'teacher' or student_number = profile ->> 'student_number')
  returning * into invitation;
  if not found then raise exception 'Registration unavailable'; end if;
  delete from public.portal_tickets where token_hash = ticket.token_hash and expires_at > now();
  if not found then raise exception 'Registration unavailable'; end if;
  insert into public.portal_profiles(id, role, username, first_name, last_name, student_number, birth_date, telegram_id)
  values (new.id, invitation.role, profile ->> 'username', profile ->> 'first_name', profile ->> 'last_name',
    invitation.student_number, case when invitation.role = 'student' then (profile ->> 'birth_date')::date end, ticket.telegram_id);
  update auth.users set raw_app_meta_data = raw_app_meta_data - 'portal_signup' where id = new.id;
  return new;
end;
$$;

create trigger portal_signup after insert on auth.users
for each row execute function public.portal_create_profile();

create function public.portal_open_session(p_ticket text, p_user uuid, p_session text)
returns boolean language plpgsql set search_path = '' as $$
begin
  delete from public.portal_tickets as t using public.portal_profiles as p
  where t.token_hash = p_ticket and t.expires_at > now() and t.profile_id = p_user
    and p.id = p_user and p.telegram_id = t.telegram_id and p.active;
  if not found then return false; end if;
  insert into public.portal_sessions(token_hash, profile_id) values (p_session, p_user);
  return true;
end;
$$;

revoke execute on function public.portal_rate_limit(text, int), public.portal_claim_invite(text, text, text),
  public.portal_issue_invite(text, text, text, text), public.portal_create_profile(),
  public.portal_open_session(text, uuid, text) from public, anon, authenticated;
grant execute on function public.portal_rate_limit(text, int), public.portal_claim_invite(text, text, text),
  public.portal_issue_invite(text, text, text, text), public.portal_open_session(text, uuid, text) to service_role;
commit;
