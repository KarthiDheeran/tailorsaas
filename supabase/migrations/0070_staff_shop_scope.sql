alter table public.staff
  add column if not exists tenant_id uuid references public.tenants(id) on delete restrict,
  add column if not exists shop_id uuid references public.shops(id) on delete restrict;

update public.staff s
set tenant_id = p.tenant_id,
    shop_id = p.shop_id
from public.profiles p
where p.staff_id = s.id
  and s.tenant_id is null
  and p.tenant_id is not null;

update public.staff s
set tenant_id = p.tenant_id
from (
  select tenant_id
  from public.profiles
  where tenant_id is not null
  group by tenant_id
  order by count(*) desc
  limit 1
) p
where s.tenant_id is null;

create index if not exists staff_tenant_shop_idx
  on public.staff (tenant_id, shop_id);

drop policy if exists staff_select on public.staff;
drop policy if exists staff_insert on public.staff;
drop policy if exists staff_update on public.staff;

create policy staff_select on public.staff
  for select
  using (
    public.auth_has_permission('staff.view')
    and (
      tenant_id is null
      or tenant_id = public.auth_user_tenant_id()
    )
  );

create policy staff_insert on public.staff
  for insert
  with check (
    public.auth_has_permission('staff.manage')
    and tenant_id = public.auth_user_tenant_id()
    and (
      shop_id is null
      or exists (
        select 1
        from public.shops sh
        where sh.id = shop_id
          and sh.tenant_id = public.auth_user_tenant_id()
      )
    )
  );

create policy staff_update on public.staff
  for update
  using (
    public.auth_has_permission('staff.manage')
    and (
      tenant_id is null
      or tenant_id = public.auth_user_tenant_id()
    )
  )
  with check (
    public.auth_has_permission('staff.manage')
    and tenant_id = public.auth_user_tenant_id()
    and (
      shop_id is null
      or exists (
        select 1
        from public.shops sh
        where sh.id = shop_id
          and sh.tenant_id = public.auth_user_tenant_id()
      )
    )
  );
