alter table public.expenses
  add column if not exists expense_scope text not null default 'Business'
  check (expense_scope in ('Business', 'Personal'));

update public.expenses
set expense_scope = 'Business'
where expense_scope is null;

notify pgrst, 'reload schema';
