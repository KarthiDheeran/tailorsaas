-- Add the customer's missing Men garment types by cloning existing setup.
-- Safe to re-run: an existing target name is skipped.
-- Run manually in Supabase SQL Editor as postgres/admin.
--
-- Clone mapping:
--   Full Shirt (FSH)  -> PATTUSHIRT
--   Half Shirt (H SH) -> LINAN HSHIRT
--   Full Shirt (FSH)  -> LINAN F SHIRT

do $$
declare
  v_mapping record;
  v_source public.catalog_garment_types%rowtype;
  v_target_id uuid;
  v_shortcut_code integer;
  v_source_rule record;
  v_target_rule_id uuid;
begin
  -- Avoid two administrators allocating the same numeric shortcut at once.
  lock table public.catalog_garment_types in share row exclusive mode;

  for v_mapping in
    select * from (values
      ('Full Shirt', 'FSH',  'PATTUSHIRT'),
      ('Half Shirt', 'H SH', 'LINAN HSHIRT'),
      ('Full Shirt', 'FSH',  'LINAN F SHIRT')
    ) as mappings(source_name, source_short_name, target_name)
  loop
    if exists (
      select 1
      from public.catalog_garment_types
      where order_section = 'Men'
        and lower(btrim(name)) = lower(btrim(v_mapping.target_name))
    ) then
      raise notice 'Skipped %: garment already exists.', v_mapping.target_name;
      continue;
    end if;

    select * into v_source
    from public.catalog_garment_types
    where order_section = 'Men'
      and lower(btrim(name)) in (
        lower(btrim(v_mapping.source_name)),
        lower(btrim(v_mapping.source_short_name))
      )
    order by is_active desc, created_at
    limit 1;

    if v_source.id is null then
      raise exception 'Source Men garment "%" / "%" was not found. No garments were added.',
        v_mapping.source_name, v_mapping.source_short_name;
    end if;

    select coalesce(max(shortcut_code), 0) + 1
      into v_shortcut_code
    from public.catalog_garment_types;

    insert into public.catalog_garment_types (
      name,
      order_section,
      shortcut_code,
      base_price,
      measurement_field_ids,
      addon_ids,
      show_order_addons,
      body_measurement_layout,
      production_print_group,
      customer_print_name,
      show_work_details_customer_print,
      is_active
    ) values (
      v_mapping.target_name,
      'Men',
      v_shortcut_code,
      v_source.base_price,
      v_source.measurement_field_ids,
      v_source.addon_ids,
      v_source.show_order_addons,
      v_source.body_measurement_layout,
      v_source.production_print_group,
      v_mapping.target_name,
      v_source.show_work_details_customer_print,
      true
    ) returning id into v_target_id;

    -- Clone measurements, tailor instructions, pocket/style and work details.
    insert into public.garment_type_fields (
      garment_type_id,
      field_id,
      section_id,
      display_order,
      is_required,
      default_value
    )
    select
      v_target_id,
      field_id,
      section_id,
      display_order,
      is_required,
      default_value
    from public.garment_type_fields
    where garment_type_id = v_source.id;

    -- Clone inventory-consumption mappings and their measurement ranges.
    for v_source_rule in
      select *
      from public.inventory_consumption_rules
      where garment_type_id = v_source.id
    loop
      insert into public.inventory_consumption_rules (
        garment_type_id,
        inventory_item_id,
        calculation_type,
        measurement_field_code,
        fixed_quantity,
        is_active
      ) values (
        v_target_id,
        v_source_rule.inventory_item_id,
        v_source_rule.calculation_type,
        v_source_rule.measurement_field_code,
        v_source_rule.fixed_quantity,
        v_source_rule.is_active
      ) returning id into v_target_rule_id;

      insert into public.inventory_consumption_ranges (
        rule_id,
        from_value,
        to_value,
        quantity
      )
      select
        v_target_rule_id,
        from_value,
        to_value,
        quantity
      from public.inventory_consumption_ranges
      where rule_id = v_source_rule.id;
    end loop;

    raise notice 'Created Men garment % with shortcut code % from %.',
      v_mapping.target_name, v_shortcut_code, v_mapping.source_name;
  end loop;
end $$;

---- Verification:
select
  name,
  shortcut_code,
  base_price,
  production_print_group,
  is_active
from public.catalog_garment_types
where order_section = 'Men'
order by shortcut_code;
