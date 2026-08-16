-- TailorSaaS manual test reset utility - scoped by shop name
-- ---------------------------------------------------------------------------
-- Use this ONLY when the customer wants to restart testing for one shop.
--
-- Before running:
--   1. Replace the value of v_shop_name with the exact shop name.
--   2. Run in Supabase SQL Editor using the postgres/admin role.
--   3. Take a backup if this is not a disposable test database.
--
-- What this deletes for the selected shop only:
--   - Orders and order items
--   - Customer payments and order financial adjustments
--   - Job cards, production slips, tally scan records, and job-card history
--   - Staff work earnings linked to deleted orders/job cards
--   - Staff payment/advance records for staff assigned to that shop
--
-- What this keeps:
--   - Login users, roles, permissions
--   - Customers
--   - Staff master records
--   - Catalog/garment setup, fields, add-ons, pricing
--   - Shop/settings configuration
--   - Inventory master data
--
-- Counter behavior:
--   - The selected shop's order number counter is reset, so its next order
--     starts from 1.
--   - Global job-card/slip sequences are reset to the next safe value based on
--     records still present. If this is the only shop, they restart from 1.
-- ---------------------------------------------------------------------------

do $$
declare
  v_shop_name text := 'PUT EXACT SHOP NAME HERE';
  v_shop_id uuid;
  v_tenant_id uuid;
  v_order_ids uuid[];
  v_job_card_ids uuid[];
  v_next_job_card_number bigint;
  v_next_stage_slip_number bigint;
begin
  if v_shop_name is null or btrim(v_shop_name) = '' or v_shop_name = 'PUT EXACT SHOP NAME HERE' then
    raise exception 'Set v_shop_name to the exact shop name before running this reset script.';
  end if;

  select s.id, s.tenant_id
    into v_shop_id, v_tenant_id
  from public.shops s
  where lower(btrim(s.name)) = lower(btrim(v_shop_name));

  if v_shop_id is null then
    raise exception 'No shop found with name "%". Check public.shops.name and try again.', v_shop_name;
  end if;

  select coalesce(array_agg(o.id), array[]::uuid[])
    into v_order_ids
  from public.orders o
  where o.shop_id = v_shop_id;

  select coalesce(array_agg(jc.id), array[]::uuid[])
    into v_job_card_ids
  from public.job_cards jc
  where jc.order_id = any(v_order_ids);

  raise notice 'Resetting shop "%" (%). Orders found: %, Job cards found: %',
    v_shop_name,
    v_shop_id,
    cardinality(v_order_ids),
    cardinality(v_job_card_ids);

  -- Detach inventory audit rows from deleted test orders/job cards.
  update public.inventory_movements
  set order_id = null
  where order_id = any(v_order_ids);

  update public.inventory_movements
  set job_card_id = null
  where job_card_id = any(v_job_card_ids);

  -- Remove payroll/payment records first because some tables restrict order delete.
  delete from public.staff_payments sp
  using public.staff s
  where sp.staff_id = s.id
    and s.shop_id = v_shop_id;

  delete from public.staff_work_earnings
  where order_id = any(v_order_ids)
     or job_card_id = any(v_job_card_ids);

  delete from public.work_assignments
  where order_id = any(v_order_ids);

  delete from public.order_financial_adjustments
  where order_id = any(v_order_ids);

  delete from public.payments
  where order_id = any(v_order_ids);

  -- Remove job/production/tally details before orders.
  delete from public.job_card_stage_slips
  where order_id = any(v_order_ids);

  delete from public.job_card_activity_logs
  where order_id = any(v_order_ids)
     or job_card_id = any(v_job_card_ids);

  delete from public.job_cards
  where id = any(v_job_card_ids);

  -- Remove attachment metadata. Actual files in Supabase Storage/local folder
  -- are not deleted by this SQL; clean those separately if required.
  delete from public.order_attachments
  where order_id = any(v_order_ids);

  -- Finally remove orders; order_items cascade from orders.
  delete from public.orders
  where id = any(v_order_ids);

  -- Reset only this shop's active order counter so next order starts from 1.
  delete from public.shop_order_number_counters
  where tenant_id = v_tenant_id
    and shop_id = v_shop_id;

  -- Keep global sequences safe for remaining shops/records.
  select coalesce(max(nullif(regexp_replace(job_card_number, '\D', '', 'g'), '')::bigint), 0) + 1
    into v_next_job_card_number
  from public.job_cards;

  execute format(
    'alter sequence if exists public.job_card_number_seq restart with %s',
    greatest(v_next_job_card_number, 1)
  );

  select coalesce(max(nullif(regexp_replace(slip_code, '\D', '', 'g'), '')::bigint), 0) + 1
    into v_next_stage_slip_number
  from public.job_card_stage_slips;

  execute format(
    'alter sequence if exists public.job_card_stage_slip_code_seq restart with %s',
    greatest(v_next_stage_slip_number, 1)
  );

  raise notice 'Reset complete for shop "%". Next order number for this shop will be 1.', v_shop_name;
end $$;

-- Optional verification after running:
-- select s.name, count(o.id) as remaining_orders
-- from public.shops s
-- left join public.orders o on o.shop_id = s.id
-- group by s.name
-- order by s.name;
