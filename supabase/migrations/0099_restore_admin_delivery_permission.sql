-- Restore Delivery access for installations where the built-in Admin role
-- predates the standalone delivery.view permission.

update public.roles
set permissions = array_append(permissions, 'delivery.view')
where id = 'role-admin'
  and not ('delivery.view' = any(permissions));
