begin;

create table if not exists public.portal_quiz_student_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.portal_profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  student_ids uuid[] not null check (cardinality(student_ids) between 1 and 100),
  created_at timestamptz not null default now()
);

create unique index if not exists portal_quiz_student_groups_owner_name
  on public.portal_quiz_student_groups (owner_id, lower(name));

alter table public.portal_quiz_student_groups enable row level security;
revoke all on public.portal_quiz_student_groups from public, anon, authenticated;
grant select, insert, update on public.portal_quiz_student_groups to service_role;

commit;
