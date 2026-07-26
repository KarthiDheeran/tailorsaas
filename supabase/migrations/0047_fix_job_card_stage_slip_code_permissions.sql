create or replace function public.generate_job_card_stage_slip_code()
returns text
language sql
security definer
set search_path = public
as $$
  select 'JCS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.job_card_stage_slip_code_seq')::text, 5, '0')
$$;

grant execute on function public.generate_job_card_stage_slip_code() to authenticated, service_role;
