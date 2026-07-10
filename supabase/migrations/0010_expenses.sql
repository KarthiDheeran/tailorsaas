-- Phase 8B: expense ledger for Accounts.
--
-- Payments already track money coming in. Expenses track money going out,
-- so the owner can move from "collections" toward real shop profitability.

create table expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category text not null check (category in (
    'Fabric','Accessories','Salary','Rent','Utilities',
    'Maintenance','Transport','Marketing','Other'
  )),
  vendor text,
  description text not null,
  amount numeric not null check (amount > 0),
  payment_mode text not null check (payment_mode in ('Cash','GPay','UPI','Card','Bank Transfer','Cheque')),
  notes text,
  recorded_by uuid references profiles(id) on delete set null,
  voided boolean not null default false,
  voided_at timestamptz,
  voided_by uuid references profiles(id) on delete set null,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table expenses enable row level security;

create policy expenses_select on expenses for select
  using (auth_has_permission('expenses.view'));

create policy expenses_insert on expenses for insert
  with check (auth_has_permission('expenses.manage'));

create policy expenses_update on expenses for update
  using (auth_has_permission('expenses.manage'))
  with check (auth_has_permission('expenses.manage'));

grant select, insert, update on expenses to authenticated, service_role;

update roles
set permissions = permissions || array['expenses.view', 'expenses.manage']::text[]
where id = 'role-admin'
  and not ('expenses.view' = any(permissions));

update roles
set permissions = permissions || array['expenses.view', 'expenses.manage']::text[]
where id = 'role-manager'
  and not ('expenses.view' = any(permissions));
