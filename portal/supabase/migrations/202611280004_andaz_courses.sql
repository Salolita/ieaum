begin;

create table if not exists public.portal_andaz_passed_courses (
  profile_id uuid not null references public.portal_profiles(id) on delete cascade,
  slot text not null check (slot ~ '^[0-9]{1,2}(-[1-3])?$'),
  course_id text not null check (course_id ~ '^[0-9]{1,2}(-[1-3]|[a-d])?$'),
  credits smallint not null check (credits between 1 and 3),
  primary key (profile_id, slot)
);

alter table public.portal_andaz_passed_courses enable row level security;
revoke all on public.portal_andaz_passed_courses from public, anon, authenticated;
grant select, insert, update, delete on public.portal_andaz_passed_courses to service_role;

commit;
