begin;

create table public.erae_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.portal_profiles(id) on delete cascade not null,
  join_code text unique not null,
  admin_digest text not null,
  title text not null check (char_length(title) between 1 and 120),
  caption text not null check (char_length(caption) <= 800),
  page_count int not null check (page_count between 1 and 40),
  created_at timestamptz not null default now(),
  published boolean not null default false,
  revision int not null default 0,
  body jsonb not null default '{"position":-1,"furthest":-1,"players":{},"questions":[]}'
);
create index erae_rooms_owner on public.erae_rooms(owner_id, created_at desc);

create table public.erae_images (
  room_id uuid references public.erae_rooms(id) on delete cascade not null,
  page int not null check (page between 0 and 40),
  jpeg bytea not null check (octet_length(jpeg) between 4 and 550000),
  primary key (room_id, page)
);

alter table public.erae_rooms enable row level security;
alter table public.erae_images enable row level security;
revoke all on public.erae_rooms, public.erae_images from anon, authenticated;
grant select, insert, update, delete on public.erae_rooms, public.erae_images to service_role;

create function public.erae_create_room(p_owner uuid, p_title text, p_caption text, p_page_count int, p_join text, p_admin text)
returns uuid language plpgsql set search_path = '' as $$
declare created uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text, 0));
  if (select count(*) from public.erae_rooms where owner_id = p_owner) >= 8 then return null; end if;
  insert into public.erae_rooms (owner_id, title, caption, page_count, join_code, admin_digest)
  values (p_owner, p_title, p_caption, p_page_count, p_join, p_admin) returning id into created;
  return created;
end;
$$;
revoke execute on function public.erae_create_room(uuid,text,text,int,text,text) from public, anon, authenticated;
grant execute on function public.erae_create_room(uuid,text,text,int,text,text) to service_role;

commit;
