-- Enable the approved shared Add-ons / Extras for Pant and Half pant.
--
-- Forward-only and idempotent. Add-ons remain global records in
-- public.catalog_addons; this migration only replaces the enabled addon_ids
-- on Pant and Half pant with the approved list.

with approved_addons(name, display_order) as (
  values
    ('2 கட் பாக்கெட்', 10),
    ('கட் பாக்கெட் வேண்டாம்', 20),
    ('ஃபுல் கிரிப்', 30),
    ('பிளீட் 1', 40),
    ('சைடு 2 கையில்', 50),
    ('பாட்டம் 1.25 டவர்', 60),
    ('கட் பெல்ட்', 70),
    ('பாக்கெட் உயரம்', 80),
    ('பாக்கெட் ஷர்ட் கிளாத்', 90),
    ('ஹூக் வேண்டாம்', 100),
    ('ஓவர் பட்டா', 110),
    ('கட் பெல்ட் காஜா பட்டன்', 120)
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
where lower(btrim(garment.name)) in ('pant', 'half pant');
