alter table public.job_card_stage_slips
  add column if not exists tallied_quantity integer not null default 0,
  add column if not exists tally_wage_amount numeric not null default 0,
  add column if not exists tally_extra_amount numeric not null default 0,
  add column if not exists tally_notes text,
  add column if not exists last_tallied_at timestamptz;

update public.job_card_stage_slips
set tallied_quantity = coalesce(quantity, 1),
    tally_wage_amount = coalesce(wage_amount, 0),
    last_tallied_at = tallied_at
where tallied_at is not null
  and coalesce(tallied_quantity, 0) = 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'job_card_stage_slips_tallied_quantity_check'
      and conrelid = 'public.job_card_stage_slips'::regclass
  ) then
    alter table public.job_card_stage_slips
      add constraint job_card_stage_slips_tallied_quantity_check
      check (tallied_quantity >= 0 and tallied_quantity <= quantity);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'job_card_stage_slips_tally_amounts_check'
      and conrelid = 'public.job_card_stage_slips'::regclass
  ) then
    alter table public.job_card_stage_slips
      add constraint job_card_stage_slips_tally_amounts_check
      check (tally_wage_amount >= 0 and tally_extra_amount >= 0);
  end if;
end $$;

create index if not exists job_card_stage_slips_last_tallied_at_idx
  on public.job_card_stage_slips (last_tallied_at desc)
  where last_tallied_at is not null;
