begin;

create table if not exists public.portal_home_content (
  id smallint primary key check (id = 1),
  body jsonb not null check (jsonb_typeof(body) = 'object' and pg_column_size(body) <= 16000)
);

create table if not exists public.portal_required_channels (
  chat_id text primary key check (chat_id ~ '^-[0-9]{5,16}$'),
  title text not null check (char_length(title) between 1 and 128),
  invite_url text not null check (invite_url ~ '^https://t[.]me/([+]?[A-Za-z0-9_-]+|joinchat/[A-Za-z0-9_-]+)$'),
  enabled boolean not null default false
);

alter table public.portal_home_content enable row level security;
alter table public.portal_required_channels enable row level security;
revoke all on public.portal_home_content, public.portal_required_channels from public, anon, authenticated;
grant select, insert, update on public.portal_home_content to service_role;
grant select, insert, update, delete on public.portal_required_channels to service_role;

commit;
