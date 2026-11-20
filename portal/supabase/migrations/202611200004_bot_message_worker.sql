-- The existing endpoint and Vault credential also serve personal notices.
select cron.schedule('ieaum-deliver-week-notices', '* * * * *', $job$
  select net.http_get(url := 'https://numeralab.ieaum.ir/api/week', headers := jsonb_build_object('Authorization', 'Bearer ' || decrypted_secret))
  from vault.decrypted_secrets where name = 'ieaum_week_worker' and (
    exists (select 1 from public.portal_due_weeks(now()))
    or exists (select 1 from public.portal_announcements where state = 'sending' and confirm_message_id is not null)
    or exists (select 1 from public.portal_bot_preferences where not menu_ready or not usernames_queued
      or (birthday_enabled and extract(hour from now() at time zone 'Asia/Tehran') = 9
        and birthdays_queued_on is distinct from (now() at time zone 'Asia/Tehran')::date))
    or exists (select 1 from public.portal_personal_notices where state = 'sending'
      or (state = 'pending' and available_at <= now() and (kind = 'username'
        or exists (select 1 from public.portal_bot_preferences where birthday_enabled))))
  );
$job$);
