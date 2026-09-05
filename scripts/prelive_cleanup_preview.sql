-- Read-only pre-live cleanup preview. Safe to run in Supabase SQL Editor.
-- It changes no data and helps choose the correct cleanup scope.

select 'Orders' as data_group, count(*) as records from public.orders
union all select 'Customers', count(*) from public.customers
union all select 'Payments', count(*) from public.payments
union all select 'Financial adjustments', count(*) from public.order_financial_adjustments
union all select 'Expenses', count(*) from public.expenses
union all select 'Job cards', count(*) from public.job_cards
union all select 'Production slips', count(*) from public.job_card_stage_slips
union all select 'Work assignments', count(*) from public.work_assignments
union all select 'Staff earnings', count(*) from public.staff_work_earnings
union all select 'Staff advances / tea', count(*) from public.staff_payments
union all select 'Customer fabric', count(*) from public.customer_fabrics
union all select 'Inventory movements', count(*) from public.inventory_movements
union all select 'Inventory delivery consumption', count(*) from public.inventory_delivery_consumptions
union all select 'Production print batches', count(*) from public.production_print_batches
union all select 'Calendar reminders', count(*) from public.calendar_reminders
union all select 'WhatsApp history', count(*) from public.whatsapp_messages
union all select 'Non-Admin login users', count(*) from public.profiles where role_id <> 'role-admin'
union all select 'Admin login users (always preserve)', count(*) from public.profiles where role_id = 'role-admin'
union all select 'Staff records', count(*) from public.staff
order by data_group;

select
  s.name as shop,
  count(distinct o.id) as orders,
  count(distinct c.id) as customers
from public.shops s
left join public.orders o on o.shop_id = s.id
left join public.customers c on c.shop_id = s.id
group by s.id, s.name
order by s.name;
