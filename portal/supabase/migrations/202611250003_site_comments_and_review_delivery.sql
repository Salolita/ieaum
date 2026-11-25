begin;

create table if not exists public.portal_site_comments (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.portal_profiles(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 80),
  visibility text not null check (visibility in ('public', 'private')),
  message text not null check (char_length(message) between 1 and 1200),
  admin_reply text check (char_length(admin_reply) between 1 and 1200),
  created_at timestamptz not null default now()
);

create index if not exists portal_site_comments_latest
  on public.portal_site_comments (created_at desc, id desc);
create index if not exists portal_site_comments_public_latest
  on public.portal_site_comments (created_at desc, id desc) where visibility = 'public';
create index if not exists portal_site_comments_author_latest
  on public.portal_site_comments (author_id, created_at desc, id desc) where visibility = 'private';

alter table public.portal_site_comments enable row level security;
revoke all on public.portal_site_comments from public, anon, authenticated;
grant select, insert, update, delete on public.portal_site_comments to service_role;

alter table public.portal_profiles
  add column if not exists membership_review_retry_at timestamptz;

commit;
