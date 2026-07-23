alter table catalog_garment_types
  add column if not exists shortcut_code integer;

alter table catalog_garment_types
  add constraint catalog_garment_types_shortcut_code_positive
  check (shortcut_code is null or shortcut_code > 0);

with shortcut_map(name, code) as (
  values
    ('Alteration', 1),
    ('Blouse', 2),
    ('Dress', 3),
    ('Gown', 4),
    ('Kurta', 5),
    ('Lehenga', 6),
    ('Pant', 7),
    ('Salwar Suit', 8),
    ('Saree Fall/Pico', 9),
    ('Shirt', 10),
    ('Suit', 11),
    ('Waistcoat', 12)
)
update catalog_garment_types garment
set shortcut_code = shortcut_map.code,
    updated_at = now()
from shortcut_map
where lower(trim(garment.name)) = lower(shortcut_map.name)
  and garment.shortcut_code is null
  and not exists (
    select 1
    from catalog_garment_types existing
    where existing.shortcut_code = shortcut_map.code
      and existing.id <> garment.id
  );

create unique index if not exists catalog_garment_types_shortcut_code_unique
  on catalog_garment_types(shortcut_code)
  where shortcut_code is not null;

alter table catalog_garment_types
  add constraint catalog_garment_types_active_shortcut_code_required
  check (is_active = false or shortcut_code is not null)
  not valid;
