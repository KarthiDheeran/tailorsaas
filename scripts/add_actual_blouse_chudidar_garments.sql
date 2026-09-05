-- Clone the customer's Blouse and Chudidar garment variants.
-- Safe to re-run: existing targets in the same section are skipped.
-- Run manually in Supabase SQL Editor as postgres/admin.

do $$
declare
  m record;
  src public.catalog_garment_types%rowtype;
  target_id uuid;
  next_code integer;
  src_rule record;
  target_rule_id uuid;
begin
  lock table public.catalog_garment_types in share row exclusive mode;

  for m in
    select * from (values
      ('Blouse',   'Blouse',   'LINING BLOUSE',    450::numeric),
      ('Blouse',   'Blouse',   'SATHA BLOUSE',     250::numeric),
      ('Blouse',   'Blouse',   'PRINCESS CUT BLO', 500::numeric),
      ('Blouse',   'Blouse',   'PATTU BLO',         500::numeric),
      ('Blouse',   'Blouse',   'EMPRADING BLO',     600::numeric),
      ('Blouse',   'Blouse',   'PATTU SET',        1200::numeric),
      ('Blouse',   'Blouse',   'FULL FROK',        1200::numeric),
      ('Blouse',   'Blouse',   'HALF SARRY',       1200::numeric),
      ('Blouse',   'Blouse',   'LEHANGA',          1500::numeric),
      ('Chudidar', 'Chudidar', 'LAING CHUDI',       450::numeric),
      ('Chudidar', 'Chudidar', 'SATHA CHUDI',       400::numeric),
      ('Chudidar', 'Chudidar', 'LAINGTOP',          400::numeric),
      ('Chudidar', 'Chudidar', 'SATHA TOP',         350::numeric),
      ('Chudidar', 'Chudidar', 'COAT',              350::numeric),
      ('Chudidar', 'Chudidar', 'PANT',              150::numeric)
    ) as x(section_name, source_name, target_name, target_rate)
  loop
    if exists (
      select 1 from public.catalog_garment_types
      where order_section = m.section_name
        and lower(btrim(name)) = lower(btrim(m.target_name))
    ) then
      raise notice 'Skipped % / %: already exists.', m.section_name, m.target_name;
      continue;
    end if;

    select * into src
    from public.catalog_garment_types
    where order_section = m.section_name
      and lower(btrim(name)) = lower(btrim(m.source_name))
    order by is_active desc, created_at
    limit 1;

    if src.id is null then
      raise exception 'Source % garment "%" was not found.',
        m.section_name, m.source_name;
    end if;

    select coalesce(max(shortcut_code), 0) + 1 into next_code
    from public.catalog_garment_types;

    insert into public.catalog_garment_types (
      name, order_section, shortcut_code, base_price,
      measurement_field_ids, addon_ids, show_order_addons,
      body_measurement_layout, production_print_group,
      customer_print_name, show_work_details_customer_print, is_active
    ) values (
      m.target_name, m.section_name, next_code, m.target_rate,
      src.measurement_field_ids, src.addon_ids, src.show_order_addons,
      src.body_measurement_layout, src.production_print_group,
      m.target_name, src.show_work_details_customer_print, true
    ) returning id into target_id;

    insert into public.garment_type_fields (
      garment_type_id, field_id, section_id,
      display_order, is_required, default_value
    )
    select target_id, field_id, section_id,
      display_order, is_required, default_value
    from public.garment_type_fields
    where garment_type_id = src.id;

    for src_rule in
      select * from public.inventory_consumption_rules
      where garment_type_id = src.id
    loop
      insert into public.inventory_consumption_rules (
        garment_type_id, inventory_item_id, calculation_type,
        measurement_field_code, fixed_quantity, is_active
      ) values (
        target_id, src_rule.inventory_item_id, src_rule.calculation_type,
        src_rule.measurement_field_code, src_rule.fixed_quantity, src_rule.is_active
      ) returning id into target_rule_id;

      insert into public.inventory_consumption_ranges (
        rule_id, from_value, to_value, quantity
      )
      select target_rule_id, from_value, to_value, quantity
      from public.inventory_consumption_ranges
      where rule_id = src_rule.id;
    end loop;

    raise notice 'Created % / % at rate % with code %.',
      m.section_name, m.target_name, m.target_rate, next_code;
  end loop;
end $$;

select order_section, name, shortcut_code, base_price, is_active
from public.catalog_garment_types
where order_section in ('Blouse', 'Chudidar')
order by order_section, shortcut_code;
