begin;

create table public.portal_bot_contacts (
  chat_id text primary key check (chat_id ~ '^[1-9][0-9]{0,15}$'),
  active boolean not null,
  observed_at timestamptz not null
);

insert into public.portal_bot_contacts(chat_id, active, observed_at)
select chat_id, true, '-infinity'::timestamptz from (
  select telegram_id as chat_id from public.portal_profiles
  union select former_telegram_id from public.portal_profiles
  union select chat_id from public.portal_week_subscriptions
) known where chat_id ~ '^[1-9][0-9]{0,15}$';

create function public.portal_record_bot_contact(p_chat text, p_active boolean, p_observed timestamptz)
returns void language sql set search_path = '' as $$
  insert into public.portal_bot_contacts as contact(chat_id, active, observed_at)
  values (p_chat, p_active, p_observed)
  on conflict(chat_id) do update set active = excluded.active, observed_at = excluded.observed_at
  where contact.observed_at < excluded.observed_at
    or (contact.observed_at = excluded.observed_at and not excluded.active);
$$;

alter table public.portal_announcements add column confirm_message_id bigint;

create table public.portal_announcement_deliveries (
  announcement_id uuid references public.portal_announcements(id) on delete cascade,
  chat_id text not null,
  state text not null default 'pending' check (state in ('pending','sending','sent','failed')),
  attempts int not null default 0,
  available_at timestamptz not null default now() + interval '5 seconds',
  primary key (announcement_id, chat_id)
);
create index portal_announcement_delivery_work on public.portal_announcement_deliveries(available_at) where state in ('pending','sending');

create function public.portal_enqueue_announcement(p_id uuid, p_admin text, p_message bigint, p_audience text)
returns int language plpgsql set search_path = '' as $$
declare total int;
begin
  if p_audience not in ('all','accounts') or p_message <= 0 then return null; end if;
  update public.portal_announcements set state = 'sending', confirm_message_id = p_message
  where id = p_id and admin_telegram_id = p_admin and state = 'draft' and expires_at > now();
  if not found then return null; end if;
  insert into public.portal_announcement_deliveries(announcement_id,chat_id)
  select p_id,c.chat_id from public.portal_bot_contacts c where p_audience = 'all' and c.active
  union
  select p_id,p.telegram_id from public.portal_profiles p left join public.portal_bot_contacts c on c.chat_id = p.telegram_id
  where p.active and p.telegram_id ~ '^[1-9][0-9]{0,15}$' and c.active is distinct from false;
  get diagnostics total = row_count;
  return total;
end;
$$;

create function public.portal_claim_announcement_deliveries(p_count int)
returns table(announcement_id uuid, chat_id text, body text, attempts int)
language plpgsql set search_path = '' as $$
begin
  -- An interrupted attempt may have reached Telegram. Do not send it twice.
  update public.portal_announcement_deliveries d set state = 'failed' where d.state = 'sending' and d.available_at <= now();
  return query with batch as (
    select d.announcement_id,d.chat_id from public.portal_announcement_deliveries d
    where d.state = 'pending' and d.available_at <= now()
    order by d.available_at,d.announcement_id,d.chat_id limit least(greatest(p_count,1),25) for update skip locked
  ), claimed as (
    update public.portal_announcement_deliveries d set state = 'sending', available_at = now() + interval '2 minutes', attempts = d.attempts + 1
    from batch b where d.announcement_id = b.announcement_id and d.chat_id = b.chat_id returning d.announcement_id,d.chat_id,d.attempts
  ) select c.announcement_id,c.chat_id,a.body,c.attempts from claimed c join public.portal_announcements a on a.id = c.announcement_id;
end;
$$;

create function public.portal_finish_announcements()
returns table(announcement_id uuid, admin_telegram_id text, message_id bigint, delivered int, failed int)
language sql set search_path = '' as $$
  with closed as (
    update public.portal_announcements a set state = 'sent'
    where a.state = 'sending' and a.confirm_message_id is not null and not exists (
      select 1 from public.portal_announcement_deliveries d where d.announcement_id = a.id and d.state in ('pending','sending')
    ) returning a.id,a.admin_telegram_id,a.confirm_message_id
  ) select c.id,c.admin_telegram_id,c.confirm_message_id,(count(*) filter (where d.state = 'sent'))::int,(count(*) filter (where d.state = 'failed'))::int
  from closed c left join public.portal_announcement_deliveries d on d.announcement_id = c.id group by c.id,c.admin_telegram_id,c.confirm_message_id;
$$;

alter table public.portal_bot_contacts enable row level security;
alter table public.portal_announcement_deliveries enable row level security;
revoke all on public.portal_bot_contacts, public.portal_announcement_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.portal_bot_contacts, public.portal_announcement_deliveries to service_role;
revoke execute on function public.portal_record_bot_contact(text,boolean,timestamptz), public.portal_enqueue_announcement(uuid,text,bigint,text),
  public.portal_claim_announcement_deliveries(int), public.portal_finish_announcements() from public, anon, authenticated;
grant execute on function public.portal_record_bot_contact(text,boolean,timestamptz), public.portal_enqueue_announcement(uuid,text,bigint,text),
  public.portal_claim_announcement_deliveries(int), public.portal_finish_announcements() to service_role;

commit;
