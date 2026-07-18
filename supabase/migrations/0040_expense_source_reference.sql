alter table expenses
  add column if not exists source text not null default 'Manual Expense',
  add column if not exists reference text;
