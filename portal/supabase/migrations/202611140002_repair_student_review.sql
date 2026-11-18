begin;

create or replace function public.portal_queue_student()
returns trigger language plpgsql security definer set search_path = '' as $$
declare application jsonb;
begin
  -- The Auth admin endpoint writes app metadata after inserting the user.
  select raw_app_meta_data -> 'portal_student_request' into application
    from auth.users where id = new.id;
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

drop trigger portal_student_request on auth.users;
create constraint trigger portal_student_request after insert on auth.users
deferrable initially deferred for each row execute function public.portal_queue_student();

-- Recover requests that Auth stored before the portal profile existed.
with requests as (
  select u.id, u.created_at, u.raw_app_meta_data -> 'portal_student_request' as application
    from auth.users u
    where u.email like '%@accounts.numeralab.ieaum.ir'
      and u.raw_app_meta_data ? 'portal_student_request'
      and not exists (select 1 from public.portal_profiles p where p.id = u.id)
), recovered as (
  insert into public.portal_profiles(id, role, username, first_name, last_name, student_number, birth_date, phone, telegram_id, active, review_status, requested_at)
  select id, 'student', application ->> 'username', application ->> 'first_name', application ->> 'last_name',
    application ->> 'student_number', (application ->> 'birth_date')::date,
    application ->> 'phone', application ->> 'telegram_id', false, 'pending', created_at
  from requests
  order by created_at, id
  on conflict do nothing
  returning id
)
update auth.users u set raw_app_meta_data = u.raw_app_meta_data - 'portal_student_request'
from recovered where u.id = recovered.id;

commit;
