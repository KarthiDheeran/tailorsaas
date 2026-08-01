-- A short operator-facing code, separate from the immutable historical
-- STAFF-0001 identifier used by existing records and audit trails.
create sequence if not exists public.staff_code_seq start 1;

alter table public.staff
  add column if not exists staff_code bigint;

update public.staff
set staff_code = nextval('public.staff_code_seq')
where staff_code is null;

alter table public.staff
  alter column staff_code set default nextval('public.staff_code_seq'),
  alter column staff_code set not null;

create unique index if not exists staff_staff_code_key
  on public.staff (staff_code);

grant usage on sequence public.staff_code_seq to authenticated, service_role;
