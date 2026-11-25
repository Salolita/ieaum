begin;

create table if not exists public.portal_site_contacts (
  id smallint primary key check (id = 1),
  body jsonb not null check (jsonb_typeof(body) = 'object' and pg_column_size(body) <= 50000)
);

alter table public.portal_site_contacts enable row level security;
revoke all on public.portal_site_contacts from public, anon, authenticated;
grant select, insert, update on public.portal_site_contacts to service_role;

commit;
