-- Per-staff, per-garment, per-stage labour rates.
-- Shape:
-- {
--   "<catalog_garment_type_id>": {
--     "Cutting": 200,
--     "Stitching": 300
--   }
-- }

alter table public.staff
  add column if not exists garment_stage_rates jsonb not null default '{}'::jsonb;
