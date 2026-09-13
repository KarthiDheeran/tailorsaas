-- Run only in the local Studio after creating admin@tailor.test in Authentication.
-- Does not change the password or overwrite an existing profile.
insert into public.profiles (
  id, full_name, role_id, active, must_change_password, tenant_id, shop_id
)
select u.id, 'Local Admin', 'role-admin', true, false, t.id, s.id
from auth.users u
join public.tenants t on t.name = 'NewLook'
join public.shops s on s.tenant_id = t.id and s.name = 'Main Shop'
where u.email = 'admin@tailor.test'
on conflict (id) do nothing;

select p.full_name, p.role_id
from public.profiles p join auth.users u on u.id = p.id
where u.email = 'admin@tailor.test';
-- Expected: one Local Admin / role-admin row. Zero rows means the auth user is missing.
