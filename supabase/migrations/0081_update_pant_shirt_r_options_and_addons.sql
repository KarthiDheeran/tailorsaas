-- Update garment metadata option values for Pant/Shirt and merge the shared
-- Add-ons / Extras catalogue.
--
-- Forward-only and idempotent. Existing field IDs, codes, names, sections,
-- display orders, input types, historical order data, and field-schema
-- snapshots are preserved.

-- Shirt sleeve instruction fields. These existing codes are mapped to
-- Half Shirt / Full Shirt / Shirt-style garments.
update public.catalog_fields
set options_json = case code
    when 'r1' then jsonb_build_array(
      'பட்டி மட்டும்',
      'உள் பட்டி',
      'சாதா சர்ட்',
      '1 இன்ச் பட்டி',
      '1.5 இன்ச் பட்டி',
      '3/4 இன்ச் பட்டி'
    )
    when 'r2' then jsonb_build_array(
      'அயன் + 3/4 இன்ச் கையில்',
      'அனைத்தும் 2 கையில்',
      '2 கையில்'
    )
    when 'r3' then jsonb_build_array(
      'ஒரு பாக்கெட்',
      'உள் பாக்கெட்',
      '2 பாக்கெட் பிளாப்',
      '2 சைடு பாக்கெட்',
      '2 பாக்கெட்'
    )
    when 'r4' then jsonb_build_array(
      'ஸ்லாக்',
      'கட் சர்ட்',
      'ஸ்லாக் சைடு ஓப்பன்'
    )
    else options_json
  end,
  updated_at = now()
where code in ('r1', 'r2', 'r3', 'r4')
  and exists (
    select 1
    from public.garment_type_fields gtf
    join public.catalog_garment_types gt on gt.id = gtf.garment_type_id
    where gtf.field_id = catalog_fields.id
      and lower(gt.name) in ('half shirt', 'full shirt', 'shirt')
  );

-- Pant fields verified from the existing Pant garment metadata mapping:
-- side_pocket, hip_pocket, ticket_pocket. No existing Pant R4 field/code was
-- present in the inspected metadata, so this migration does not invent one.
update public.catalog_fields
set options_json = case code
    when 'side_pocket' then jsonb_build_array(
      'கிராஸ் பாக்கெட்',
      'சாதா பாக்கெட்'
    )
    when 'hip_pocket' then jsonb_build_array(
      '3/4 இன்ச் கையில் ஹெம்மிங்'
    )
    when 'ticket_pocket' then jsonb_build_array(
      'TP 0',
      'TP 1',
      'TP 2'
    )
    else options_json
  end,
  updated_at = now()
where code in ('side_pocket', 'hip_pocket', 'ticket_pocket')
  and exists (
    select 1
    from public.garment_type_fields gtf
    join public.catalog_garment_types gt on gt.id = gtf.garment_type_id
    where gtf.field_id = catalog_fields.id
      and lower(gt.name) = 'pant'
  );

-- Merge shared global Add-ons / Extras. New values default to price 0 because
-- no customer price or worker pay amount was supplied in the requirement.
with incoming(name) as (
  values
    ('2 கட் பாக்கெட்'),
    ('கட் பாக்கெட் வேண்டாம்'),
    ('ஃபுல் கிரிப்'),
    ('பிளீட் 1'),
    ('சைடு 2 கையில்'),
    ('பாட்டம் 1.25 டவர்'),
    ('கட் பெல்ட்'),
    ('பாக்கெட் உயரம்'),
    ('பாக்கெட் ஷர்ட் கிளாத்'),
    ('ஹூக் வேண்டாம்'),
    ('ஓவர் பட்டா'),
    ('கட் பெல்ட் காஜா பட்டன்'),
    ('பட்டி காலர் பட்டன்'),
    ('பட்டி ஊசி நடையில்'),
    ('மேல் காஜா 5 இன்ச்'),
    ('கை போல்டு'),
    ('நெக் மட்டும்'),
    ('பேக் பிளீட்'),
    ('பிரஷ் பட்டன்'),
    ('கை டவர் 1 இன்ச்'),
    ('பட்டி ஊசி எடை'),
    ('நெக் பேண்ட் துணி'),
    ('கை V போல்டு'),
    ('கப் கிராஸ்'),
    ('2 ஷோல்டர் பிளாப்'),
    ('பட்டி 4 கையில்'),
    ('மேல் காஜா 3.75 இன்ச்'),
    ('லேபில் வேண்டும்'),
    ('பேனா பாக்கெட்'),
    ('2 பாக்கெட் பிளாப்'),
    ('பாக்கெட் V'),
    ('பாக்கெட் மூலை மடக்கி')
),
normalized as (
  select distinct btrim(name) as name
  from incoming
  where btrim(name) <> ''
)
insert into public.catalog_addons (
  name,
  name_ta,
  default_price,
  worker_stage_rates,
  is_active
)
select
  normalized.name,
  normalized.name,
  0,
  '{}'::jsonb,
  true
from normalized
where not exists (
  select 1
  from public.catalog_addons existing
  where lower(btrim(existing.name)) = lower(normalized.name)
);
