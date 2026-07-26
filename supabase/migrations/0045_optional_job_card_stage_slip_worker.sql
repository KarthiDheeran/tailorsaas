alter table public.job_card_stage_slips
  alter column staff_id drop not null,
  alter column staff_name set default 'Unassigned';

update public.job_card_stage_slips
set staff_name = 'Unassigned'
where staff_name is null or trim(staff_name) = '';
