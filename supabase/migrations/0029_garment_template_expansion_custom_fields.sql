-- Add the next batch of common tailoring garment templates.
-- Custom measurement fields do not need a schema change: catalog_garment_types
-- already stores text[] field ids, and the app now accepts ids prefixed with
-- custom: for shop-specific fields.

update catalog_garment_types
set measurement_field_ids = array[
  'waist', 'hip', 'seat', 'pantLength', 'inseam', 'thigh',
  'knee', 'calf', 'bottom', 'rise'
]
where lower(trim(name)) in ('pant', 'trouser', 'trousers');

insert into catalog_garment_types (
  name, base_price, measurement_field_ids, addon_ids, is_active
)
select
  template.name,
  0,
  template.measurement_field_ids,
  array[]::uuid[],
  true
from (
  values
    (
      'Waistcoat',
      array[
        'chest', 'waist', 'hip', 'shoulder', 'crossFront',
        'crossBack', 'waistcoatLength', 'neck', 'armhole'
      ]::text[]
    ),
    (
      'Salwar Suit',
      array[
        'bust', 'waist', 'hip', 'shoulder', 'crossFront', 'crossBack',
        'sleeveLength', 'sleeveRound', 'armhole', 'neck', 'neckDepthFront',
        'neckDepthBack', 'kameezLength', 'salwarLength', 'bottom'
      ]::text[]
    ),
    (
      'Lehenga',
      array[
        'bust', 'waist', 'hip', 'shoulder', 'blouseLength',
        'neckDepthFront', 'neckDepthBack', 'lehengaLength', 'flare'
      ]::text[]
    ),
    (
      'Gown',
      array[
        'bust', 'waist', 'hip', 'shoulder', 'crossFront', 'crossBack',
        'sleeveLength', 'sleeveRound', 'armhole', 'neck', 'gownLength', 'flare'
      ]::text[]
    ),
    (
      'Saree Fall/Pico',
      array['sareeFallLength', 'waist', 'hip']::text[]
    )
) as template(name, measurement_field_ids)
where not exists (
  select 1
  from catalog_garment_types existing
  where lower(trim(existing.name)) = lower(trim(template.name))
);
