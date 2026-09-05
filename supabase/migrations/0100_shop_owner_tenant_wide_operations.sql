-- Separate super-admin account management from tenant-wide shop operations.
--
-- System Admin remains the only built-in super-admin role. Shop Owner gains
-- visibility across the tenant's shops, but every operation still requires
-- its existing feature permission (orders.view, delivery.view,
-- orders.viewPayments, orders.recordPayment, etc.). This migration does not
-- grant settings.manageUsers or settings.manageRoles to Shop Owner.

update public.roles
set permissions = array_append(permissions, 'shops.viewAll'),
    updated_at = now()
where id = 'role-admin'
  and not ('shops.viewAll' = any(permissions));

update public.roles
set permissions = array_append(permissions, 'shops.viewAll'),
    updated_at = now()
where lower(btrim(name)) = 'shop owner'
  and not ('shops.viewAll' = any(permissions));

create or replace function public.auth_can_access_scope(
  p_tenant_id uuid,
  p_shop_id uuid,
  p_order_section text
)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active
      and p.tenant_id = p_tenant_id
      and (
        p.role_id = 'role-admin'
        or public.auth_has_permission('shops.viewAll')
        or p.shop_id = p_shop_id
      )
      and (
        p.role_id = 'role-admin'
        or p_order_section is null
        or p_order_section = any(p.allowed_order_sections)
      )
  )
$$;

grant execute on function public.auth_can_access_scope(uuid, uuid, text)
  to authenticated, service_role;

-- Verification: Shop Owner should have tenant-wide scope without receiving
-- super-admin user/role management permissions.
select name,
  'shops.viewAll' = any(permissions) as tenant_wide_operations,
  'settings.manageUsers' = any(permissions) as can_manage_users,
  'settings.manageRoles' = any(permissions) as can_manage_roles
from public.roles
where id = 'role-admin' or lower(btrim(name)) = 'shop owner'
order by id;
