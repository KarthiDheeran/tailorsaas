-- Keep production slip codes safe after manual testing resets, restores, or
-- partial data imports. Older migrations initialized the sequence from row
-- count, which can lag behind the highest existing JCS-YYYY-NNNNN code.

create or replace function public.generate_job_card_stage_slip_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate text;
begin
  loop
    v_candidate :=
      'JCS-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.job_card_stage_slip_code_seq')::text, 5, '0');

    exit when not exists (
      select 1
      from public.job_card_stage_slips
      where upper(slip_code) = upper(v_candidate)
    );
  end loop;

  return v_candidate;
end;
$$;

grant execute on function public.generate_job_card_stage_slip_code() to authenticated, service_role;

select setval(
  'public.job_card_stage_slip_code_seq',
  greatest(
    coalesce(
      (
        select max(nullif(substring(slip_code from '(\d+)$'), '')::bigint)
        from public.job_card_stage_slips
        where slip_code ~ '\d+$'
      ),
      0
    ),
    1
  ),
  exists (select 1 from public.job_card_stage_slips)
);
