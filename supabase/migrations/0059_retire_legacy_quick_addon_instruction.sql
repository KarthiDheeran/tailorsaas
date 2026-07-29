-- Add-ons / Extras are the single source of billable extras on an order.
-- The original Quick Add-on instruction field was a separate free-text
-- template concept and could make the two workflows look like duplicates.
--
-- This migration only retires that field from future forms/configurations.
-- It does not modify existing order measurements or immutable snapshots, so
-- historical orders continue to display their saved Quick Add-on values.

delete from garment_type_fields mappings
using catalog_fields fields
where mappings.field_id = fields.id
  and fields.code = 'quick_addon';

update catalog_fields
set is_active = false,
    updated_at = now()
where code = 'quick_addon'
  and is_active = true;
