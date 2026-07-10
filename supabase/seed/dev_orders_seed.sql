-- OPTIONAL dev/demo seed data for the Phase 6C/7A order + payment tables —
-- NOT part of the 0006_orders.sql/0008_payments.sql migrations and not
-- applied automatically. Run manually against a dev project only, e.g.:
--   supabase db execute -f supabase/seed/dev_orders_seed.sql
-- (or paste into the dashboard SQL editor).
--
-- Requires dev_customers_seed.sql and dev_catalog_seed.sql to have already
-- been run (looks up "Ramesh Kumar"/"Priya Mehta" and the seeded garment
-- types/add-ons by name — if either is missing this will insert nothing
-- useful or error on a null id).
--
-- Bypasses create_order_with_items()/record_payment() — those RPCs check
-- auth_has_permission(), which requires a real logged-in auth.uid() session;
-- running from the SQL Editor has none. Instead this inserts directly into
-- orders/order_items/payments the same way the RPCs would, then lets the
-- existing payments_recompute_order_totals trigger (0008) derive
-- advance_paid/balance/payment_status from the payment rows, exactly like a
-- real payment would. order_number_counters is fast-forwarded at the end so
-- the next real generate_order_number() call continues at ORD-2026-0007
-- instead of colliding with these 6.
--
-- A spread of statuses/payment states/dates around 2026-07-10 (today, at
-- the time this was written) so Dashboard/Reports/Orders all have something
-- to show — mirrors the old mock stub-data.ts's "a few orders dated around
-- today" convention, not an exhaustive dataset.

do $$
declare
  v_ramesh_id uuid;
  v_priya_id uuid;
  v_shirt_id uuid;
  v_pant_id uuid;
  v_blouse_id uuid;
  v_kurta_id uuid;
  v_suit_id uuid;
  v_alteration_id uuid;
  v_addon_elastic_waist uuid;
  v_addon_lining uuid;
  v_order_id uuid;
begin
  select id into v_ramesh_id from customers where name = 'Ramesh Kumar';
  select id into v_priya_id from customers where name = 'Priya Mehta';
  if v_ramesh_id is null or v_priya_id is null then
    raise exception 'dev_customers_seed.sql must be run first (Ramesh Kumar / Priya Mehta not found)';
  end if;

  select id into v_shirt_id from catalog_garment_types where name = 'Shirt';
  select id into v_pant_id from catalog_garment_types where name = 'Pant';
  select id into v_blouse_id from catalog_garment_types where name = 'Blouse';
  select id into v_kurta_id from catalog_garment_types where name = 'Kurta';
  select id into v_suit_id from catalog_garment_types where name = 'Suit';
  select id into v_alteration_id from catalog_garment_types where name = 'Alteration';
  if v_shirt_id is null or v_pant_id is null or v_blouse_id is null
    or v_kurta_id is null or v_suit_id is null or v_alteration_id is null then
    raise exception 'dev_catalog_seed.sql must be run first (one or more garment types not found)';
  end if;

  select id into v_addon_elastic_waist from catalog_addons where name = 'Elastic Waist';
  select id into v_addon_lining from catalog_addons where name = 'Lining';

  -- ---------------------------------------------------------------------
  -- Order 1 — Ramesh Kumar, Shirt x2, delivered + fully paid (advance + final)
  -- ---------------------------------------------------------------------
  insert into orders (
    order_number, customer_id, customer_snapshot, order_date, trial_date,
    delivery_date, total_amount, advance_paid, balance, payment_mode, status
  ) values (
    'ORD-2026-0001', v_ramesh_id,
    jsonb_build_object('name', 'Ramesh Kumar', 'phone', '9876543210', 'area', 'Andheri West'),
    '2026-06-20', '2026-06-25', '2026-06-30', 1600, 0, 1600, 'Cash', 'Delivered'
  ) returning id into v_order_id;

  insert into order_items (order_id, serial_no, particular, garment_type_id, qty, rate, amount)
  values (v_order_id, 1, 'Shirt', v_shirt_id, 2, 800, 1600);

  insert into payments (order_id, amount, payment_date, payment_mode, payment_type)
  values
    (v_order_id, 800, '2026-06-20', 'Cash', 'Advance'),
    (v_order_id, 800, '2026-06-30', 'Cash', 'Final');

  -- ---------------------------------------------------------------------
  -- Order 2 — Ramesh Kumar, Pant + Elastic Waist, overdue with only an
  -- advance paid
  -- ---------------------------------------------------------------------
  insert into orders (
    order_number, customer_id, customer_snapshot, order_date, trial_date,
    delivery_date, total_amount, advance_paid, balance, payment_mode, status
  ) values (
    'ORD-2026-0002', v_ramesh_id,
    jsonb_build_object('name', 'Ramesh Kumar', 'phone', '9876543210', 'area', 'Andheri West'),
    '2026-07-01', '2026-07-05', '2026-07-08', 450, 0, 450, 'UPI', 'Delayed'
  ) returning id into v_order_id;

  insert into order_items (order_id, serial_no, particular, garment_type_id, qty, rate, add_ons, add_ons_total, final_rate, amount)
  values (
    v_order_id, 1, 'Pant', v_pant_id, 1, 400,
    jsonb_build_array(jsonb_build_object('key', 'Elastic Waist', 'label', 'Elastic Waist', 'amount', 50)),
    50, 450, 450
  );

  insert into payments (order_id, amount, payment_date, payment_mode, payment_type)
  values (v_order_id, 200, '2026-07-01', 'UPI', 'Advance');

  -- ---------------------------------------------------------------------
  -- Order 3 — Priya Mehta, Blouse + Lining, in progress, due soon,
  -- advance paid
  -- ---------------------------------------------------------------------
  insert into orders (
    order_number, customer_id, customer_snapshot, order_date, trial_date,
    delivery_date, total_amount, advance_paid, balance, payment_mode, status
  ) values (
    'ORD-2026-0003', v_priya_id,
    jsonb_build_object('name', 'Priya Mehta', 'phone', '9123456780', 'area', 'Bandra'),
    '2026-07-08', null, '2026-07-12', 830, 0, 830, 'GPay', 'In Progress'
  ) returning id into v_order_id;

  insert into order_items (order_id, serial_no, particular, garment_type_id, qty, rate, add_ons, add_ons_total, final_rate, amount)
  values (
    v_order_id, 1, 'Blouse', v_blouse_id, 1, 750,
    jsonb_build_array(jsonb_build_object('key', 'Lining', 'label', 'Lining', 'amount', 80)),
    80, 830, 830
  );

  insert into payments (order_id, amount, payment_date, payment_mode, payment_type)
  values (v_order_id, 400, '2026-07-08', 'GPay', 'Advance');

  -- ---------------------------------------------------------------------
  -- Order 4 — Priya Mehta, Suit, ready, fully paid at booking
  -- ---------------------------------------------------------------------
  insert into orders (
    order_number, customer_id, customer_snapshot, order_date, trial_date,
    delivery_date, total_amount, advance_paid, balance, payment_mode, status
  ) values (
    'ORD-2026-0004', v_priya_id,
    jsonb_build_object('name', 'Priya Mehta', 'phone', '9123456780', 'area', 'Bandra'),
    '2026-07-09', '2026-07-15', '2026-07-20', 2500, 0, 2500, 'Card', 'Ready'
  ) returning id into v_order_id;

  insert into order_items (order_id, serial_no, particular, garment_type_id, qty, rate, amount)
  values (v_order_id, 1, 'Suit', v_suit_id, 1, 2500, 2500);

  insert into payments (order_id, amount, payment_date, payment_mode, payment_type)
  values (v_order_id, 2500, '2026-07-09', 'Card', 'Final');

  -- ---------------------------------------------------------------------
  -- Order 5 — Ramesh Kumar, Kurta x2, due today, no payment yet
  -- ---------------------------------------------------------------------
  insert into orders (
    order_number, customer_id, customer_snapshot, order_date, trial_date,
    delivery_date, total_amount, advance_paid, balance, payment_mode, status, payment_status
  ) values (
    'ORD-2026-0005', v_ramesh_id,
    jsonb_build_object('name', 'Ramesh Kumar', 'phone', '9876543210', 'area', 'Andheri West'),
    '2026-07-10', null, '2026-07-10', 1400, 0, 1400, 'Cash', 'In Progress', 'Due'
  ) returning id into v_order_id;

  insert into order_items (order_id, serial_no, particular, garment_type_id, qty, rate, amount)
  values (v_order_id, 1, 'Kurta', v_kurta_id, 2, 700, 1400);

  -- ---------------------------------------------------------------------
  -- Order 6 — Priya Mehta, Alteration, cancelled, never paid
  -- ---------------------------------------------------------------------
  insert into orders (
    order_number, customer_id, customer_snapshot, order_date, trial_date,
    delivery_date, total_amount, advance_paid, balance, payment_mode, status, payment_status
  ) values (
    'ORD-2026-0006', v_priya_id,
    jsonb_build_object('name', 'Priya Mehta', 'phone', '9123456780', 'area', 'Bandra'),
    '2026-06-15', null, '2026-06-18', 150, 0, 150, 'Cash', 'Cancelled', 'Overdue'
  ) returning id into v_order_id;

  insert into order_items (order_id, serial_no, particular, garment_type_id, qty, rate, amount)
  values (v_order_id, 1, 'Alteration', v_alteration_id, 1, 150, 150);

  -- Required: fast-forward the year-2026 counter past the 6 explicit order
  -- numbers above so the next generate_order_number() call returns
  -- ORD-2026-0007, not a repeat (same reasoning as dev_staff_seed.sql's
  -- staff_number_seq fast-forward).
  insert into order_number_counters (year, last_seq) values (2026, 6)
    on conflict (year) do update set last_seq = greatest(order_number_counters.last_seq, 6);
end $$;
