begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text, 'ieaum_week_worker')
where not exists (select 1 from vault.secrets where name = 'ieaum_week_worker');

create or replace function public.portal_valid_week_worker(p_key text) returns boolean
language sql security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'ieaum_week_worker' and decrypted_secret = p_key);
$$;
revoke execute on function public.portal_valid_week_worker(text) from public, anon, authenticated;
grant execute on function public.portal_valid_week_worker(text) to service_role;

select cron.schedule('ieaum-expire-presentations', '* * * * *',
  'delete from public.erae_rooms where expires_at <= now(); delete from public.erae_replacement_images where created_at <= now() - interval ''1 hour''');

select cron.schedule('ieaum-deliver-week-notices', '* * * * *', $job$
  select net.http_get(url := 'https://numeralab.ieaum.ir/api/week', headers := jsonb_build_object('Authorization', 'Bearer ' || decrypted_secret))
  from vault.decrypted_secrets where name = 'ieaum_week_worker' and exists (select 1 from public.portal_due_weeks(now()));
$job$);

commit;
