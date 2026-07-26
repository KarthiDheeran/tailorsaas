create sequence if not exists public.job_card_stage_slip_code_seq;

create or replace function public.generate_job_card_stage_slip_code()
returns text
language sql
security definer
set search_path = public
as $$
  select 'JCS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.job_card_stage_slip_code_seq')::text, 5, '0')
$$;

alter table public.job_card_stage_slips
  add column if not exists slip_code text;

with numbered as (
  select
    id,
    'JCS-' || to_char(coalesce(created_at, now()), 'YYYY') || '-' ||
      lpad(row_number() over (order by created_at, id)::text, 5, '0') as code
  from public.job_card_stage_slips
  where slip_code is null or trim(slip_code) = ''
)
update public.job_card_stage_slips slips
set slip_code = numbered.code
from numbered
where slips.id = numbered.id;

select setval(
  'public.job_card_stage_slip_code_seq',
  greatest((select count(*) from public.job_card_stage_slips), 1),
  (select count(*) from public.job_card_stage_slips) > 0
);

alter table public.job_card_stage_slips
  alter column slip_code set default public.generate_job_card_stage_slip_code();

alter table public.job_card_stage_slips
  alter column slip_code set not null;

create unique index if not exists job_card_stage_slips_slip_code_key
  on public.job_card_stage_slips (upper(slip_code));
