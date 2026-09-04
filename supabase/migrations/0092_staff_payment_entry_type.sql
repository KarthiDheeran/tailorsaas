alter table public.staff_payments
  add column if not exists entry_type text not null default 'Advance'
  check (entry_type in ('Advance', 'Tea'));

update public.staff_payments
set entry_type = 'Advance'
where entry_type is null;

notify pgrst, 'reload schema';
