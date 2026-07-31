-- Customer master is shared across a tenant.
--
-- A staff user's order operations remain restricted by shop + section through
-- orders/job-card/payment policies. Customer lookup needs to be tenant-wide so
-- a branch can create a new order for an existing customer.

drop policy if exists customers_select on public.customers;
drop policy if exists customers_insert on public.customers;
drop policy if exists customers_update on public.customers;

create policy customers_select on public.customers
  for select
  using (
    public.auth_has_permission('customers.view')
    and tenant_id = public.auth_user_tenant_id()
  );

create policy customers_insert on public.customers
  for insert
  with check (
    public.auth_has_permission('customers.create')
    and tenant_id = public.auth_user_tenant_id()
    and (
      shop_id = public.auth_user_shop_id()
      or public.auth_is_tenant_admin()
    )
  );

create policy customers_update on public.customers
  for update
  using (
    public.auth_has_permission('customers.edit')
    and tenant_id = public.auth_user_tenant_id()
  )
  with check (
    public.auth_has_permission('customers.edit')
    and tenant_id = public.auth_user_tenant_id()
  );

create or replace function public.auth_can_access_customer(p_customer_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.customers c
    where c.id = p_customer_id
      and c.tenant_id = public.auth_user_tenant_id()
  )
$$;
