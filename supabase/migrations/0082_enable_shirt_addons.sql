-- Enable the approved shared Add-ons / Extras for Half Shirt and Full Shirt.
--
-- Forward-only and idempotent. Add-ons remain global records in
-- public.catalog_addons; this migration only replaces the enabled addon_ids
-- on the two shirt garment types with the approved list.

with approved_addons(name, display_order) as (
  values
    ('பட்டி காலர் பட்டன்', 10),
    ('பட்டி ஊசி நடையில்', 20),
    ('மேல் காஜா 5 இன்ச்', 30),
    ('கை போல்டு', 40),
    ('நெக் மட்டும்', 50),
    ('பேக் பிளீட்', 60),
    ('பிரஷ் பட்டன்', 70),
    ('கை டவர் 1 இன்ச்', 80),
    ('பட்டி ஊசி எடை', 90),
    ('நெக் பேண்ட் துணி', 100),
    ('கை V போல்டு', 110),
    ('கப் கிராஸ்', 120),
    ('2 ஷோல்டர் பிளாப்', 130),
    ('பட்டி 4 கையில்', 140),
    ('மேல் காஜா 3.75 இன்ச்', 150),
    ('லேபில் வேண்டும்', 160),
    ('பேனா பாக்கெட்', 170),
    ('2 பாக்கெட் பிளாப்', 180),
    ('பாக்கெட் V', 190),
    ('பாக்கெட் மூலை மடக்கி', 200)
),
normalized_addons as (
  select distinct on (lower(btrim(name)))
    btrim(name) as name,
    min(display_order) over (partition by lower(btrim(name))) as display_order
  from approved_addons
  where btrim(name) <> ''
  order by lower(btrim(name)), display_order
),
inserted as (
  insert into public.catalog_addons (
    name,
    name_ta,
    default_price,
    worker_stage_rates,
    is_active
  )
  select
    name,
    name,
    0,
    '{}'::jsonb,
    true
  from normalized_addons incoming
  where not exists (
    select 1
    from public.catalog_addons existing
    where lower(btrim(existing.name)) = lower(incoming.name)
  )
  returning id, name
),
resolved as (
  select
    addon.id,
    incoming.display_order
  from normalized_addons incoming
  join public.catalog_addons addon
    on lower(btrim(addon.name)) = lower(incoming.name)
),
approved_ids as (
  select array_agg(id order by display_order, id)::uuid[] as ids
  from resolved
)
update public.catalog_garment_types garment
set
  addon_ids = coalesce(approved_ids.ids, '{}'::uuid[]),
  show_order_addons = true,
  updated_at = now()
from approved_ids
where lower(btrim(garment.name)) in ('half shirt', 'full shirt');
