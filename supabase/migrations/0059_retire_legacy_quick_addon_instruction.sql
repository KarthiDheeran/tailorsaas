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

-- quick_addon is a protected system field in newer schemas, so do not
-- deactivate it directly. Removing garment mappings is enough to retire it
-- from future forms while preserving historical snapshots and admin safety.
