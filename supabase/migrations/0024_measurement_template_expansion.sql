-- Expand default measurement templates for common tailoring garments.
-- Shops can still edit these in Catalog; this only improves existing rows
-- whose names match the built-in garment categories.

update catalog_garment_types
set measurement_field_ids = array[
  'chest', 'shoulder', 'crossFront', 'crossBack', 'sleeveLength',
  'sleeveRound', 'shirtLength', 'neck', 'collar', 'waist', 'armhole', 'cuff'
]
where lower(trim(name)) = 'shirt';

update catalog_garment_types
set measurement_field_ids = array[
  'waist', 'hip', 'seat', 'pantLength', 'inseam', 'thigh',
  'knee', 'calf', 'bottom', 'rise'
]
where lower(trim(name)) in ('pant', 'trouser', 'trousers');

update catalog_garment_types
set measurement_field_ids = array[
  'bust', 'waist', 'shoulder', 'crossFront', 'crossBack',
  'sleeveLength', 'sleeveRound', 'blouseLength', 'neckWidth',
  'neckDepthFront', 'neckDepthBack', 'armhole', 'dartPoint', 'princessCut'
]
where lower(trim(name)) = 'blouse';

update catalog_garment_types
set measurement_field_ids = array[
  'chest', 'waist', 'hip', 'shoulder', 'crossFront', 'crossBack',
  'sleeveLength', 'sleeveRound', 'coatLength', 'neck', 'armhole',
  'pantLength', 'inseam', 'thigh', 'bottom'
]
where lower(trim(name)) = 'suit';

update catalog_garment_types
set measurement_field_ids = array[
  'chest', 'shoulder', 'crossFront', 'crossBack', 'sleeveLength',
  'sleeveRound', 'kurtaLength', 'waist', 'hip', 'neck', 'armhole', 'slitLength'
]
where lower(trim(name)) = 'kurta';

update catalog_garment_types
set measurement_field_ids = array[
  'chest', 'shoulder', 'crossFront', 'crossBack', 'sleeveLength',
  'sleeveRound', 'sherwaniLength', 'coatLength', 'waist', 'hip', 'neck', 'armhole'
]
where lower(trim(name)) = 'sherwani';

update catalog_garment_types
set measurement_field_ids = array['waist', 'hip', 'petticoatLength', 'flare']
where lower(trim(name)) = 'petticoat';

insert into catalog_garment_types (
  name, base_price, measurement_field_ids, addon_ids, is_active
)
select
  'Dress',
  0,
  array[
    'bust', 'waist', 'hip', 'shoulder', 'crossFront', 'crossBack',
    'sleeveLength', 'sleeveRound', 'armhole', 'neck', 'neckDepthFront',
    'neckDepthBack', 'dressLength', 'flare'
  ],
  array[]::uuid[],
  true
where not exists (
  select 1 from catalog_garment_types where lower(trim(name)) = 'dress'
);
