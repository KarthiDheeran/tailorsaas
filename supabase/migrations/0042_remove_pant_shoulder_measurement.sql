-- Pant measurements should only include pant-specific fields. Remove the
-- accidental custom shoulder field if it was added to an existing shop catalog.
update catalog_garment_types
set measurement_field_ids = array_remove(measurement_field_ids, 'custom:Left Shoulder')
where lower(trim(name)) in ('pant', 'trouser', 'trousers')
  and 'custom:Left Shoulder' = any(measurement_field_ids);
