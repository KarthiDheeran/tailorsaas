-- Delivery used to share orders.view, so it was not visible as a separate
-- option in Role Access. Preserve existing access while introducing an
-- explicit permission administrators can control independently.

update public.roles
set permissions = permissions || array['delivery.view']::text[]
where id in ('role-admin', 'role-manager', 'role-receptionist', 'role-accountant')
  and 'orders.view' = any(permissions)
  and not ('delivery.view' = any(permissions));

-- Finance Income previously shared orders.viewPayments. Keep today's access
-- unchanged; administrators can now remove Finance Income independently while
-- retaining order-level payment collection permissions.
update public.roles
set permissions = permissions || array['finance.income.view']::text[]
where id in ('role-admin', 'role-manager', 'role-accountant')
  and 'orders.viewPayments' = any(permissions)
  and not ('finance.income.view' = any(permissions));
