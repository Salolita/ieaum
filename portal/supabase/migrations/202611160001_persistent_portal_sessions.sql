begin;

alter table public.portal_sessions alter column expires_at set default (now() + interval '30 days');

create function public.portal_revoke_after_password_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.portal_sessions where profile_id = new.id;
  delete from public.portal_tickets where profile_id = new.id;
  return new;
end;
$$;

revoke execute on function public.portal_revoke_after_password_change() from public, anon, authenticated;

create trigger portal_revoke_after_password_change
after update of encrypted_password on auth.users
for each row
when (old.encrypted_password is distinct from new.encrypted_password)
execute function public.portal_revoke_after_password_change();

commit;
