begin;

alter table public.portal_bot_preferences
  add column notes_group_url text check (notes_group_url is null or char_length(notes_group_url) <= 240);

alter table public.portal_announcements
  add column delivered_count int check (delivered_count >= 0),
  add column failed_count int check (failed_count >= 0);

create or replace function public.portal_finish_announcements()
returns table(announcement_id uuid, admin_telegram_id text, message_id bigint, delivered int, failed int)
language sql set search_path = '' as $$
  with counts as (
    select a.id,
      count(*) filter (where d.state = 'sent')::int as delivered,
      count(*) filter (where d.state = 'failed')::int as failed
    from public.portal_announcements a
    left join public.portal_announcement_deliveries d on d.announcement_id = a.id
    where a.state = 'sending' and a.confirm_message_id is not null
    group by a.id
    having count(*) filter (where d.state in ('pending', 'sending')) = 0
  )
  update public.portal_announcements a
  set state = 'sent', delivered_count = c.delivered, failed_count = c.failed
  from counts c where c.id = a.id and a.state = 'sending'
  returning a.id, a.admin_telegram_id, a.confirm_message_id, a.delivered_count, a.failed_count;
$$;

create function public.portal_announcement_status(p_admin text, p_id uuid default null)
returns table(id uuid, state text, delivered int, failed int, remaining int)
language sql stable set search_path = '' as $$
  with target as (
    select a.id, a.state, a.delivered_count, a.failed_count
    from public.portal_announcements a
    where a.admin_telegram_id = p_admin and a.state in ('sending', 'sent') and (p_id is null or a.id = p_id)
    order by a.source_message_id desc limit 1
  )
  select t.id, t.state,
    case when t.state = 'sent' then t.delivered_count else d.delivered end,
    case when t.state = 'sent' then t.failed_count else d.failed end,
    case when t.state = 'sent' then 0 else d.remaining end
  from target t cross join lateral (
    select count(*) filter (where deliveries.state = 'sent')::int as delivered,
      count(*) filter (where deliveries.state = 'failed')::int as failed,
      count(*) filter (where deliveries.state in ('pending', 'sending'))::int as remaining
    from public.portal_announcement_deliveries deliveries
    where deliveries.announcement_id = t.id and t.state = 'sending'
  ) d;
$$;

revoke execute on function public.portal_announcement_status(text, uuid) from public, anon, authenticated;
grant execute on function public.portal_announcement_status(text, uuid) to service_role;

commit;
