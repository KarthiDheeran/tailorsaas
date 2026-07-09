-- OPTIONAL dev/demo seed data for the Phase 6A customer tables — NOT part of
-- the 0004_customers.sql migration and not applied automatically by
-- `supabase db push`. Run manually against a dev project only, e.g.:
--   supabase db execute -f supabase/seed/dev_customers_seed.sql
-- (or paste into the dashboard SQL editor).
--
-- Real/production tables start empty per the Phase 6A instruction — this
-- file exists purely so a developer can quickly get a couple of customers
-- with saved measurements to click through in the UI.
--
-- Note: these customers get fresh UUIDs, not the mock "cust-1"/"cust-2"
-- ids — Orders are still on the old mock array (Phase 6C), so these seeded
-- customers will correctly show empty order history until then.

do $$
declare
  v_customer_id uuid;
begin
  insert into customers (customer_number, name, phone, address, area, gender)
  values (generate_customer_number(), 'Ramesh Kumar', '9876543210', '12 MG Road', 'Andheri West', 'Male')
  returning id into v_customer_id;

  insert into customer_measurements (customer_id, values, notes)
  values (
    v_customer_id,
    jsonb_build_object(
      'Chest', '40', 'Waist', '34', 'Shoulder', '18', 'Sleeve Length', '24'
    ),
    'Prefers slightly loose fit'
  );

  insert into garment_measurements (customer_id, garment_type, values, fit_notes)
  values (
    v_customer_id,
    'Shirt',
    jsonb_build_object('Chest', '40', 'Shirt Length', '29', 'Neck', '16'),
    'Loose around chest'
  );

  insert into customers (customer_number, name, phone, address, area, gender)
  values (generate_customer_number(), 'Priya Sharma', '9123456780', '45 Park Street', 'Bandra', 'Female')
  returning id into v_customer_id;

  insert into customer_measurements (customer_id, values)
  values (
    v_customer_id,
    jsonb_build_object('Bust', '36', 'Waist', '30', 'Hip', '38', 'Blouse Length', '15')
  );
end $$;
