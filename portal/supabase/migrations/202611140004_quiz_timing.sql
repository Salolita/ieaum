begin;

alter table public.portal_quizzes
  add column course_name text check (char_length(btrim(course_name)) between 1 and 120),
  add column deadline_at timestamptz,
  add column duration_minutes integer check (duration_minutes between 1 and 480);

create table public.portal_quiz_starts (
  quiz_id uuid not null references public.portal_quizzes(id) on delete cascade,
  student_id uuid not null references public.portal_profiles(id) on delete cascade,
  expires_at timestamptz not null,
  primary key (quiz_id, student_id)
);

alter table public.portal_quiz_starts enable row level security;
revoke all on public.portal_quiz_starts from anon, authenticated;
grant select, insert, update on public.portal_quiz_starts to service_role;

create function public.portal_start_quiz(p_quiz uuid, p_student uuid)
returns timestamptz language sql set search_path = '' as $$
  insert into public.portal_quiz_starts as attempt (quiz_id, student_id, expires_at)
  select q.id, p.id, least(q.deadline_at, statement_timestamp() + make_interval(mins => q.duration_minutes))
  from public.portal_quizzes q
  join public.portal_profiles p on p.id = p_student
  where q.id = p_quiz and q.published and q.duration_minutes is not null
    and (q.deadline_at is null or q.deadline_at > statement_timestamp())
    and p.active and p.role = 'student' and p.username = any(q.audience)
    and not exists (select 1 from public.portal_submissions s where s.quiz_id = q.id and s.student_id = p.id)
  on conflict (quiz_id, student_id) do update set expires_at = attempt.expires_at
  returning attempt.expires_at;
$$;

create function public.portal_submit_quiz(p_quiz uuid, p_student uuid, p_answers jsonb, p_score integer)
returns integer language plpgsql set search_path = '' as $$
declare saved_score integer;
begin
  insert into public.portal_submissions(quiz_id, student_id, answers, score)
  select q.id, p.id, p_answers, p_score
  from public.portal_quizzes q
  join public.portal_profiles p on p.id = p_student
  left join public.portal_quiz_starts a on a.quiz_id = q.id and a.student_id = p.id
  where q.id = p_quiz and q.published and p.active and p.role = 'student' and p.username = any(q.audience)
    and (q.deadline_at is null or q.deadline_at > statement_timestamp())
    and (q.duration_minutes is null or a.expires_at > statement_timestamp())
  on conflict (quiz_id, student_id) do nothing;
  select score into saved_score from public.portal_submissions where quiz_id = p_quiz and student_id = p_student;
  return saved_score;
end;
$$;

revoke execute on function public.portal_start_quiz(uuid, uuid), public.portal_submit_quiz(uuid, uuid, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.portal_start_quiz(uuid, uuid), public.portal_submit_quiz(uuid, uuid, jsonb, integer)
  to service_role;
commit;
