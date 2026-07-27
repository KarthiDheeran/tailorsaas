-- Mirrors the security-sensitive forced-password flag into auth.app_metadata.
-- app_metadata is only writable through Supabase's Admin API, unlike
-- user_metadata, so middleware can trust it without a profiles lookup.
update auth.users as u
set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('must_change_password', p.must_change_password)
from public.profiles as p
where p.id = u.id
  and not (coalesce(u.raw_app_meta_data, '{}'::jsonb) ? 'must_change_password');

-- Rollback guidance: remove only this key if the application is reverted.
-- update auth.users set raw_app_meta_data = raw_app_meta_data - 'must_change_password';
