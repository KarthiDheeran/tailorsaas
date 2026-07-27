-- Lets each shop choose the production stage whose tally scan makes a
-- garment unit Ready. Exactly one active stage should be marked final.

alter table public.catalog_work_stages
  add column if not exists is_final_stage boolean not null default false;

-- Preserve the workflow used before this setting existed: a printed
-- Ironing/Packing slip completes the final internal Finishing stage.
update public.catalog_work_stages
set is_final_stage = (stage_key = 'Ironing/Packing');

create unique index if not exists catalog_work_stages_one_final_stage_idx
  on public.catalog_work_stages (is_final_stage)
  where is_final_stage;
