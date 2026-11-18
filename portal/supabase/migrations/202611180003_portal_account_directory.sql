begin;

create or replace function public.portal_remove_user(p_id uuid) returns boolean language plpgsql set search_path = '' as $$
declare chat text;
begin
  update public.portal_profiles set active = false where id = p_id and active returning telegram_id into chat;
  if not found then return false; end if;
  delete from public.portal_sessions where profile_id = p_id;
  delete from public.portal_tickets where profile_id = p_id;
  update public.portal_week_subscriptions set enabled = false where chat_id = chat;
  return true;
end;
$$;

revoke execute on function public.portal_remove_user(uuid) from public, anon, authenticated;
grant execute on function public.portal_remove_user(uuid) to service_role;

commit;
