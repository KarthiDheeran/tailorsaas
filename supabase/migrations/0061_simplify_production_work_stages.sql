-- The shop's physical production flow is now Cutting -> Stitching. Ready and
-- Delivered remain manual job-card/order statuses, not printable work stages.
-- Keep historic stage rows and activity intact; deactivate unused choices.

update public.catalog_work_stages
set
  is_active = stage_key in ('Cutting', 'Stitching'),
  is_final_stage = false,
  display_order = case stage_key
    when 'Cutting' then 1
    when 'Stitching' then 2
    else display_order
  end,
  updated_at = now();
