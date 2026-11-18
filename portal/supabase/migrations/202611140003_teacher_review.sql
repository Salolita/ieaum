begin;

alter table public.portal_profiles
  drop constraint portal_student_review,
  add column course_name text,
  add constraint portal_account_review check (
    review_status in ('approved', 'pending', 'rejected') and
    (review_status = 'approved' or not active) and
    (phone is null or phone ~ '^\+?[0-9]{10,15}$') and
    (course_name is null or (role = 'teacher' and char_length(btrim(course_name)) between 1 and 120)) and
    (role <> 'teacher' or (student_number is null and (review_status = 'approved' or (course_name is not null and phone is not null))))
  );

create or replace function public.portal_queue_student()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  metadata jsonb;
  application jsonb;
  account_role text;
  request_key text;
begin
  select raw_app_meta_data into metadata from auth.users where id = new.id;
  if metadata ? 'portal_student_request' then
    account_role := 'student';
    request_key := 'portal_student_request';
  elsif metadata ? 'portal_teacher_request' then
    account_role := 'teacher';
    request_key := 'portal_teacher_request';
  else
    return new;
  end if;
  application := metadata -> request_key;

  insert into public.portal_profiles(
    id, role, username, first_name, last_name, student_number, birth_date, phone, telegram_id, course_name, active, review_status
  )
  values (
    new.id, account_role, application ->> 'username', application ->> 'first_name', application ->> 'last_name',
    case when account_role = 'student' then application ->> 'student_number' end,
    case when account_role = 'student' then (application ->> 'birth_date')::date end,
    application ->> 'phone', application ->> 'telegram_id',
    case when account_role = 'teacher' then application ->> 'course_name' end,
    false, 'pending'
  );
  update auth.users set raw_app_meta_data = raw_app_meta_data - request_key where id = new.id;
  return new;
end;
$$;

commit;
