begin;
alter table public.portal_profiles
  alter column telegram_id drop not null,
  add column phone text,
  add column review_status text not null default 'approved',
  add column requested_at timestamptz not null default now(),
  add constraint portal_student_review check (
    review_status in ('approved', 'pending', 'rejected') and
    (review_status = 'approved' or (role = 'student' and not active)) and
    (phone is null or phone ~ '^\+?[0-9]{10,15}$')
  );

create function public.portal_queue_student()
returns trigger language plpgsql security definer set search_path = '' as $$
declare application jsonb := new.raw_app_meta_data -> 'portal_student_request';
begin
  if application is null then return new; end if;
  insert into public.portal_profiles(id, role, username, first_name, last_name, student_number, birth_date, phone, telegram_id, active, review_status)
  values (
    new.id, 'student', application ->> 'username', application ->> 'first_name', application ->> 'last_name',
    application ->> 'student_number', (application ->> 'birth_date')::date,
    application ->> 'phone', application ->> 'telegram_id', false, 'pending'
  );
  update auth.users set raw_app_meta_data = raw_app_meta_data - 'portal_student_request' where id = new.id;
  return new;
end;
$$;

create trigger portal_student_request after insert on auth.users
for each row execute function public.portal_queue_student();
revoke execute on function public.portal_queue_student() from public, anon, authenticated;
commit;
