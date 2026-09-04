create table if not exists public.production_print_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  order_section text not null,
  production_group text not null,
  slip_ids uuid[] not null,
  order_count integer not null check (order_count > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists production_print_batches_shop_created_idx
  on public.production_print_batches (tenant_id, shop_id, created_at desc);

alter table public.production_print_batches enable row level security;

create policy production_print_batches_select on public.production_print_batches for select
  using (
    auth.uid() is not null
    and tenant_id = public.auth_user_tenant_id()
    and (shop_id = public.auth_user_shop_id() or public.auth_is_tenant_admin())
    and public.auth_has_permission('orders.printJobCard')
  );

create policy production_print_batches_insert on public.production_print_batches for insert
  with check (
    auth.uid() is not null
    and tenant_id = public.auth_user_tenant_id()
    and shop_id = public.auth_user_shop_id()
    and public.auth_has_permission('orders.printJobCard')
  );

grant select, insert on public.production_print_batches to authenticated, service_role;
