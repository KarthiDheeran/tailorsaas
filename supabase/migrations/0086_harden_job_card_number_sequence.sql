-- Keep job card numbers safe after test resets, restores, or partial imports.
-- If job_card_number_seq lags behind existing JC-YYYY-NNNN values, syncing
-- job cards can otherwise generate a duplicate job_card_number.

create or replace function public.generate_job_card_number() returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_candidate text;
begin
  if not (
    auth_has_permission('orders.create') or
    auth_has_permission('orders.edit') or
    auth_has_permission('staff.manage')
  ) then
    raise exception 'permission denied: job card generation requires order or staff management permission';
  end if;

  loop
    v_candidate :=
      'JC-' || extract(year from now())::int || '-' ||
      lpad(nextval('public.job_card_number_seq')::text, 4, '0');

    exit when not exists (
      select 1
      from public.job_cards
      where upper(job_card_number) = upper(v_candidate)
    );
  end loop;

  return v_candidate;
end;
$$;

grant execute on function public.generate_job_card_number() to authenticated, service_role;

select setval(
  'public.job_card_number_seq',
  greatest(
    coalesce(
      (
        select max(nullif(substring(job_card_number from '(\d+)$'), '')::bigint)
        from public.job_cards
        where job_card_number ~ '\d+$'
      ),
      0
    ),
    1
  ),
  exists (select 1 from public.job_cards)
);
