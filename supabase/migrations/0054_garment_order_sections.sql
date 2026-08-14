-- Garments are configured into the three order-entry sections. The value is
-- deliberately stored on the catalog record rather than an order so one
-- shared shop login can use the correct filtered garment list.

alter table catalog_garment_types
  add column if not exists order_section text not null default 'Men'
  check (order_section in ('Men', 'Chudidar', 'Blouse'));

-- Sensible starting groups for the current catalog. Managers can change any
-- assignment later from Settings > Garment Types.
update catalog_garment_types
set order_section = case lower(trim(name))
  when 'half pant' then 'Chudidar'
  when 'skirt' then 'Chudidar'
  when 'finoform' then 'Chudidar'
  else 'Men'
end;

create index if not exists catalog_garment_types_active_section_name_idx
  on catalog_garment_types (order_section, name)
  where is_active = true;
