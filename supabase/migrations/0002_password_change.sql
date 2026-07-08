-- Phase 2: forced/self password-change support.
--
-- Today's profiles_update RLS policy (0001) only allows settings.manageUsers
-- to update any profiles row — an ordinary user has no way to update even
-- their own row, including the one flag the password-change flow needs to
-- clear. This RPC is intentionally the only way a plain user can touch their
-- own profiles row: it does exactly one thing (clear must_change_password for
-- the caller), nothing else — no self-service update of role_id/active/
-- staff_id/full_name/phone is opened up anywhere.
create function mark_password_changed()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update profiles
  set must_change_password = false
  where id = auth.uid();
$$;

-- Explicit, rather than relying on Supabase's public-schema default
-- privileges: any authenticated user may call this (and only this) function.
grant execute on function mark_password_changed() to authenticated;
