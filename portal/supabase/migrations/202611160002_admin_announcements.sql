begin;

create table public.portal_announcements (
  id uuid primary key default gen_random_uuid(),
  admin_telegram_id text not null,
  source_message_id integer not null,
  body text not null check (char_length(body) between 1 and 3800),
  state text not null default 'draft' check (state in ('draft', 'sending', 'sent', 'cancelled')),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  unique (admin_telegram_id, source_message_id)
);

alter table public.portal_announcements enable row level security;
revoke all on public.portal_announcements from public, anon, authenticated;
grant select, insert, update on public.portal_announcements to service_role;

commit;
