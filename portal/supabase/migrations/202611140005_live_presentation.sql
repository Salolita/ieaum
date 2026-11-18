begin;

create table public.live_presentation (
  id integer primary key check (id = 1),
  revision integer not null default 0,
  body jsonb not null default '{"room":null,"questions":[],"position":-1,"players":{}}',
  admin_digest text not null check (admin_digest ~ '^[0-9a-f]{64}$')
);

alter table public.live_presentation enable row level security;
revoke all on public.live_presentation from public, anon, authenticated;
grant select, update on public.live_presentation to service_role;

commit;
