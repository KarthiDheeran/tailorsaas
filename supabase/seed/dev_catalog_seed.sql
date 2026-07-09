-- OPTIONAL dev/demo seed data for the Phase 6B catalog tables — NOT part of
-- the 0005_catalog.sql migration and not applied automatically. Run
-- manually against a dev project only, e.g.:
--   supabase db execute -f supabase/seed/dev_catalog_seed.sql
-- (or paste into the dashboard SQL editor).
--
-- Recreates the original Catalog module's seed set (the 3 spec'd garment
-- types with exact numbers — Pant/Shirt/Blouse — plus 3 assumed ones —
-- Kurta/Suit/Alteration — and the 9 default add-ons), so a developer can
-- click through New Order / Catalog admin with real-looking data without
-- hand-entering it first. Production tables start empty per the Phase 6A/6B
-- "start empty" rule — a real shop configures its own catalog through the
-- UI.

do $$
declare
  v_addon_inner_pocket uuid;
  v_addon_extra_pocket uuid;
  v_addon_elastic_waist uuid;
  v_addon_lining uuid;
  v_addon_premium_buttons uuid;
  v_addon_boat_neck uuid;
  v_addon_deep_neck uuid;
  v_addon_padded uuid;
begin
  insert into catalog_addons (name, default_price) values ('Inner Pocket', 20)
    returning id into v_addon_inner_pocket;
  insert into catalog_addons (name, default_price) values ('Extra Pocket', 40)
    returning id into v_addon_extra_pocket;
  insert into catalog_addons (name, default_price) values ('Elastic Waist', 50)
    returning id into v_addon_elastic_waist;
  insert into catalog_addons (name, default_price) values ('Lining', 80)
    returning id into v_addon_lining;
  insert into catalog_addons (name, default_price) values ('Premium Buttons', 100)
    returning id into v_addon_premium_buttons;
  insert into catalog_addons (name, default_price) values ('Boat Neck', 100)
    returning id into v_addon_boat_neck;
  insert into catalog_addons (name, default_price) values ('Deep Neck', 150)
    returning id into v_addon_deep_neck;
  insert into catalog_addons (name, default_price) values ('Padded', 200)
    returning id into v_addon_padded;
  -- Unlinked to any garment yet, same as the original seed's intent.
  insert into catalog_addons (name, default_price) values ('Urgent Delivery', 250);

  insert into catalog_garment_types (name, base_price, measurement_field_ids, addon_ids)
  values (
    'Pant', 400,
    array['waist', 'hip', 'pantLength', 'inseam', 'thigh', 'bottom'],
    array[v_addon_inner_pocket, v_addon_extra_pocket, v_addon_elastic_waist]
  );

  insert into catalog_garment_types (name, base_price, measurement_field_ids, addon_ids)
  values (
    'Shirt', 800,
    array['chest', 'shoulder', 'sleeveLength', 'shirtLength', 'neck', 'waist', 'armhole', 'cuff'],
    array[v_addon_inner_pocket, v_addon_extra_pocket, v_addon_premium_buttons]
  );

  insert into catalog_garment_types (name, base_price, measurement_field_ids, addon_ids)
  values (
    'Blouse', 750,
    array['bust', 'waist', 'shoulder', 'sleeveLength', 'blouseLength', 'armhole', 'neckDepthFront', 'neckDepthBack'],
    array[v_addon_boat_neck, v_addon_deep_neck, v_addon_padded, v_addon_lining]
  );

  -- Kurta/Suit/Alteration base price + fields are assumptions (no spec beyond
  -- "seed these garment types"), same as the original mock seed's own note.
  insert into catalog_garment_types (name, base_price, measurement_field_ids, addon_ids)
  values (
    'Kurta', 700,
    array['chest', 'shoulder', 'sleeveLength', 'kurtaLength', 'waist', 'neck'],
    array[]::uuid[]
  );

  insert into catalog_garment_types (name, base_price, measurement_field_ids, addon_ids)
  values (
    'Suit', 2500,
    array['chest', 'waist', 'hip', 'shoulder', 'sleeveLength'],
    array[]::uuid[]
  );

  insert into catalog_garment_types (name, base_price, measurement_field_ids, addon_ids)
  values ('Alteration', 0, array[]::text[], array[]::uuid[]);
end $$;
