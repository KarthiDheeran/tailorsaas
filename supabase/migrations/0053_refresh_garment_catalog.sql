-- NewLook garment catalog refresh requested by the shop.
-- Existing legacy rows are deactivated rather than hard-deleted so historic
-- orders and customer measurement records retain their original references.

update catalog_garment_types
set
  is_active = false,
  shortcut_code = null,
  updated_at = now()
where lower(name) not in (
  'half shirt', 'full shirt', 'half pant', 'pant',
  'safari', 'skirt', 'finoform', 'coat'
);

insert into catalog_garment_types (
  name, shortcut_code, base_price, measurement_field_ids, addon_ids, is_active
)
select item.name, item.shortcut_code, 0, '{}', '{}', true
from (
  values
    ('Half Shirt', 1),
    ('Full Shirt', 2),
    ('Half pant', 3),
    ('Safari', 5),
    ('Skirt', 6),
    ('Finoform', 7),
    ('Coat', 8)
) as item(name, shortcut_code)
where not exists (
  select 1 from catalog_garment_types existing
  where lower(existing.name) = lower(item.name)
);

update catalog_garment_types as garment
set
  shortcut_code = codes.shortcut_code,
  is_active = true,
  updated_at = now()
from (
  values
    ('Half Shirt', 1),
    ('Full Shirt', 2),
    ('Half pant', 3),
    ('Pant', 4),
    ('Safari', 5),
    ('Skirt', 6),
    ('Finoform', 7),
    ('Coat', 8)
) as codes(name, shortcut_code)
where lower(garment.name) = lower(codes.name);
