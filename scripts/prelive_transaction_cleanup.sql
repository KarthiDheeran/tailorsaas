-- TailorSaaS pre-live transaction cleanup
-- ===========================================================================
-- ONE-TIME MANUAL SCRIPT. Run in Supabase SQL Editor as postgres/admin only
-- after taking a verified backup.
--
-- PRESERVES:
--   customers and measurements, staff, login users, roles/permissions,
--   shops/tenants, settings, catalogs, garment configuration, inventory item
--   masters/types and inventory consumption rules/ranges.
--
-- REMOVES:
--   orders, order items, payments, expenses, job cards, production slips,
--   work assignments, tally/activity history, staff advances/tea/earnings,
--   production print history, customer-fabric transactions, reminders,
--   WhatsApp history, inventory movements and delivery-consumption history.
--
-- Inventory quantities are reset to zero for real opening-stock entry.
-- Order/job-card/slip numbering restarts from 1.
-- Files in Supabase Storage are not removed by this SQL.
-- ===========================================================================

do $$
declare
  -- Safety lock: review the NOTICE counts first, then replace this value with
  -- exactly CLEAN PRELIVE TRANSACTIONS and run the complete script again.
  v_confirmation text := 'TYPE CONFIRMATION HERE';
  v_orders bigint;
  v_payments bigint;
  v_expenses bigint;
  v_job_cards bigint;
  v_staff_payments bigint;
  v_inventory_movements bigint;
begin
  select count(*) into v_orders from public.orders;
  select count(*) into v_payments from public.payments;
  select count(*) into v_expenses from public.expenses;
  select count(*) into v_job_cards from public.job_cards;
  select count(*) into v_staff_payments from public.staff_payments;
  select count(*) into v_inventory_movements from public.inventory_movements;

  raise notice 'CLEANUP PREVIEW: orders=%, payments=%, expenses=%, job cards=%, staff advances/tea=%, inventory movements=%',
    v_orders, v_payments, v_expenses, v_job_cards, v_staff_payments, v_inventory_movements;

  if v_confirmation <> 'CLEAN PRELIVE TRANSACTIONS' then
    raise exception using message =
      'Cleanup stopped safely. Review the NOTICE counts, set v_confirmation to CLEAN PRELIVE TRANSACTIONS, then run again.';
  end if;

  -- Inventory delivery history restricts order deletion, so remove it first.
  delete from public.inventory_delivery_consumptions;
  delete from public.inventory_movements;
  delete from public.customer_fabrics;

  -- Production, assignments and staff transaction history.
  delete from public.production_print_batches;
  delete from public.staff_work_earnings;
  delete from public.staff_payments;
  delete from public.work_assignments;
  delete from public.job_card_activity_logs;
  delete from public.job_card_stage_slips;
  delete from public.job_cards;

  -- Finance and orders. Restrictive child records are removed before orders;
  -- order_items then cascade automatically with their parent order.
  delete from public.order_financial_adjustments;
  delete from public.payments;
  delete from public.order_attachments;
  delete from public.orders;
  delete from public.expenses;

  -- Other operational/test history.
  delete from public.calendar_reminders;
  delete from public.whatsapp_messages;
  delete from public.shared_desktop_operator_sessions;

  -- Preserve inventory items and rules, but clear the test opening balance.
  update public.inventory_items
  set quantity_on_hand = 0,
      updated_at = now();

  -- Restart only transaction numbering. Customer/staff numbering is preserved
  -- because those master records are intentionally retained.
  delete from public.shop_order_number_counters;
  delete from public.order_section_number_counters;
  delete from public.order_number_counters;
  alter sequence public.job_card_number_seq restart with 1;
  alter sequence public.job_card_stage_slip_code_seq restart with 1;

  raise notice 'PRE-LIVE TRANSACTION CLEANUP COMPLETE. Customers, staff, users and all configuration were preserved.';
end $$;

-- Verification (run after successful cleanup):
-- select
--   (select count(*) from public.orders) as orders,
--   (select count(*) from public.payments) as payments,
--   (select count(*) from public.expenses) as expenses,
--   (select count(*) from public.job_cards) as job_cards,
--   (select count(*) from public.customers) as preserved_customers,
--   (select count(*) from public.staff) as preserved_staff,
--   (select count(*) from public.profiles) as preserved_users;
