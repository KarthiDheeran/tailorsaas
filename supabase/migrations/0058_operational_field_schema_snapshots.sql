-- Operational documents retain the immutable form schema captured on order_items.
alter table job_cards
  add column if not exists field_schema_snapshot jsonb;

alter table public.job_card_stage_slips
  add column if not exists field_schema_snapshot jsonb;
