-- Reuse the existing authenticated worker and endpoint for queued deliveries.
select cron.schedule('ieaum-deliver-week-notices', '* * * * *', $job$
  select net.http_get(url := 'https://numeralab.ieaum.ir/api/week', headers := jsonb_build_object('Authorization', 'Bearer ' || decrypted_secret))
  from vault.decrypted_secrets where name = 'ieaum_week_worker' and (
    exists (select 1 from public.portal_due_weeks(now()))
    or exists (select 1 from public.portal_announcements where state = 'sending' and confirm_message_id is not null)
  );
$job$);
