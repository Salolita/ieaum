begin;

-- Existing names with dots or hyphens remain valid for sign-in and can be renamed.
alter table public.portal_profiles drop constraint portal_profiles_username_check;
alter table public.portal_profiles add constraint portal_profiles_username_check check (username ~ '^[a-z0-9_][a-z0-9_.-]{2,31}$');

create table public.portal_announcement_composers (
  admin_telegram_id text primary key,
  id uuid not null,
  expires_at timestamptz not null default now() + interval '15 minutes'
);

create table public.portal_bot_preferences (
  id int primary key check (id = 1),
  menu_ready boolean not null default false,
  usernames_queued boolean not null default false,
  birthday_enabled boolean not null default true,
  birthday_template text not null default '{name} عزیز، تولدت مبارک! 🎉 امیدواریم سال پیش‌رو پر از سلامتی و موفقیت باشد.'
    check (char_length(birthday_template) between 1 and 800 and position('{name}' in birthday_template) > 0),
  birthdays_queued_on date
);
insert into public.portal_bot_preferences (id) values (1);

create table public.portal_personal_notices (
  profile_id uuid references public.portal_profiles(id) on delete cascade,
  kind text check (kind in ('username','birthday')),
  event_date date,
  state text not null default 'pending' check (state in ('pending','sending','sent','skipped','failed')),
  attempts int not null default 0,
  available_at timestamptz not null default now(),
  primary key(profile_id,kind,event_date)
);
create index portal_personal_notice_work on public.portal_personal_notices(available_at) where state in ('pending','sending');

create function public.portal_prepare_personal_notices(p_kind text,p_date date,p_profiles uuid[])
returns void language plpgsql set search_path = '' as $$
begin
  if p_kind = 'username' then
    update public.portal_bot_preferences set usernames_queued=true where id=1 and not usernames_queued;
    if not found then return; end if;
    insert into public.portal_personal_notices(profile_id,kind,event_date)
    select id,'username',p_date from public.portal_profiles where active and telegram_id is not null and username !~ '^[a-z0-9_]{5,32}$'
    on conflict do nothing;
  elsif p_kind = 'birthday' then
    update public.portal_bot_preferences set birthdays_queued_on=p_date where id=1 and birthday_enabled and (birthdays_queued_on is null or birthdays_queued_on<p_date);
    if not found then return; end if;
    insert into public.portal_personal_notices(profile_id,kind,event_date)
    select id,'birthday',p_date from public.portal_profiles where id=any(p_profiles) and active and telegram_id is not null
    on conflict do nothing;
  end if;
end;
$$;

create function public.portal_claim_personal_notices(p_date date)
returns setof public.portal_personal_notices language plpgsql set search_path = '' as $$
begin
  update public.portal_personal_notices set state=case when state='sending' then 'failed' else 'skipped' end
    where (state='sending' and available_at<=now()) or (kind='birthday' and state='pending' and event_date<p_date);
  return query with batch as (
    select n.profile_id,n.kind,n.event_date from public.portal_personal_notices n
    where n.state='pending' and n.available_at<=now() and (n.kind='username' or exists (
      select 1 from public.portal_bot_preferences where id=1 and birthday_enabled
    )) order by n.available_at,n.profile_id limit 5 for update skip locked
  ) update public.portal_personal_notices n set state='sending',available_at=now()+interval '2 minutes',attempts=n.attempts+1
    from batch b where n.profile_id=b.profile_id and n.kind=b.kind and n.event_date=b.event_date returning n.*;
end;
$$;

alter table public.portal_announcement_composers enable row level security;
alter table public.portal_bot_preferences enable row level security;
alter table public.portal_personal_notices enable row level security;
revoke all on public.portal_announcement_composers, public.portal_bot_preferences, public.portal_personal_notices from public, anon, authenticated;
grant select, insert, update, delete on public.portal_announcement_composers, public.portal_bot_preferences, public.portal_personal_notices to service_role;
revoke execute on function public.portal_prepare_personal_notices(text,date,uuid[]), public.portal_claim_personal_notices(date) from public, anon, authenticated;
grant execute on function public.portal_prepare_personal_notices(text,date,uuid[]), public.portal_claim_personal_notices(date) to service_role;

create function public.portal_rotate_presentation_code(p_owner uuid,p_room uuid,p_digest text)
returns boolean language sql set search_path = '' as $$
  with updated as (
    update public.erae_rooms set admin_digest=p_digest,revision=revision+1 where id=p_room and owner_id=p_owner and (expires_at is null or expires_at>now()) returning id
  ) select exists(select 1 from updated);
$$;
revoke execute on function public.portal_rotate_presentation_code(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.portal_rotate_presentation_code(uuid,uuid,text) to service_role;

commit;
