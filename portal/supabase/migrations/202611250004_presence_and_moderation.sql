begin;

alter table public.erae_rooms add column if not exists moderation_disabled boolean not null default false;
alter table public.portal_site_comments drop constraint if exists portal_site_comments_author_name_check;
alter table public.portal_site_comments add constraint portal_site_comments_author_name_check
  check (char_length(author_name) between 1 and 163);
update public.portal_site_comments c set author_name = left(trim(concat_ws(' ', p.first_name, p.last_name)), 163)
from public.portal_profiles p
where c.author_id = p.id and trim(concat_ws(' ', p.first_name, p.last_name)) <> ''
  and c.author_name is distinct from left(trim(concat_ws(' ', p.first_name, p.last_name)), 163);

create table if not exists public.portal_presence_settings (
  id smallint primary key check (id = 1),
  active_day date,
  mode text not null default 'telegram' check (mode in ('telegram', 'report'))
);
insert into public.portal_presence_settings(id) values (1) on conflict do nothing;

create table if not exists public.portal_presence_events (
  id text primary key,
  day date not null,
  service text not null check (service in ('presentation', 'quiz', 'livecode')),
  session_title text not null check (char_length(session_title) <= 120),
  attendee_name text not null check (char_length(attendee_name) between 1 and 163),
  mode text not null check (mode in ('telegram', 'report')),
  created_at timestamptz not null default now()
);
create index if not exists portal_presence_events_day on public.portal_presence_events (day, created_at desc);
alter table public.portal_presence_events enable row level security;
alter table public.portal_presence_settings enable row level security;
revoke all on public.portal_presence_events, public.portal_presence_settings from public, anon, authenticated;
grant select, insert on public.portal_presence_events to service_role;
grant select, insert, update on public.portal_presence_settings to service_role;

commit;
