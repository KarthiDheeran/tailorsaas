alter table public.catalog_addons
  add column if not exists worker_stage_rates jsonb not null default '{}'::jsonb;

alter table public.job_card_stage_slips
  add column if not exists labour_add_ons_snapshot jsonb;
