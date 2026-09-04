-- The Mens role is section-scoped order-entry access and must explicitly opt
-- in to sensitive Delivery/Finance menus. Remove permissions inherited during
-- the 0094 compatibility backfill only from this named role.

update public.roles
set permissions = array_remove(
  array_remove(permissions, 'delivery.view'),
  'finance.income.view'
)
where lower(btrim(name)) in ('mens', 'men', 'mens role', 'men role')
  and (
    'delivery.view' = any(permissions)
    or 'finance.income.view' = any(permissions)
  );
