alter table job_cards
  add column if not exists wage_rate numeric not null default 0,
  add column if not exists wage_amount numeric not null default 0;

