-- One tenant-wide production-print setup managed by Admin or Shop Owner.
begin;

alter table public.production_print_layouts
  add column if not exists is_global boolean not null default false,
  add column if not exists is_active boolean not null default true;

update public.production_print_layouts set is_global = false where is_global;

with ranked as (
  select layout.id,
    row_number() over (
      partition by layout.tenant_id, layout.order_section, layout.garment_type_id
      order by layout.updated_at desc, layout.id desc
    ) as position
  from public.production_print_layouts layout
  join public.profiles updater on updater.id = layout.updated_by and updater.active
  join public.roles updater_role on updater_role.id = updater.role_id
  where updater.role_id = 'role-admin'
     or 'shops.viewAll' = any(updater_role.permissions)
)
update public.production_print_layouts layout
set is_global = true
from ranked
where ranked.id = layout.id and ranked.position = 1;

create unique index production_print_layouts_global_unique
  on public.production_print_layouts (
    tenant_id,
    order_section,
    coalesce(garment_type_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where is_global;

drop policy if exists production_print_layouts_select on public.production_print_layouts;
drop policy if exists production_print_layouts_delete on public.production_print_layouts;
create policy production_print_layouts_select on public.production_print_layouts for select using (
  auth.uid() is not null
  and is_global
  and tenant_id = public.auth_user_tenant_id()
  and public.auth_can_access_scope(tenant_id, public.auth_user_shop_id(), order_section)
  and (public.auth_has_permission('settings.view') or public.auth_has_permission('orders.printJobCard'))
);
revoke delete on public.production_print_layouts from authenticated;

create or replace function public.save_production_print_layout(
  p_order_section text, p_garment_type_id uuid, p_columns_per_row integer, p_cells jsonb
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := public.auth_user_tenant_id();
  v_shop uuid := public.auth_user_shop_id();
  v_id uuid;
begin
  if not public.auth_has_permission('settings.manageShop')
     or not (public.auth_is_tenant_admin() or public.auth_has_permission('shops.viewAll'))
  then raise exception 'permission denied: tenant-wide production layout access required'; end if;
  if v_tenant is null or v_shop is null or p_order_section not in ('Men','Chudidar','Blouse')
     or not public.auth_can_access_scope(v_tenant, v_shop, p_order_section)
  then raise exception 'Invalid or inaccessible order section'; end if;
  if p_columns_per_row < 4 or p_columns_per_row > 8
  then raise exception 'Columns per row must be between 4 and 8.'; end if;
  if jsonb_typeof(p_cells) <> 'array' or jsonb_array_length(p_cells) > 60
  then raise exception 'Invalid production print cells.'; end if;
  if exists (select 1 from jsonb_array_elements(p_cells) cell where
      jsonb_typeof(cell->'fieldCodes') <> 'array' or jsonb_array_length(cell->'fieldCodes') not between 1 and 2
      or (jsonb_array_length(cell->'fieldCodes') > 1 and (cell->'fieldCodes') ?| array['__empty_box__','__blank_space__'])
      or coalesce((cell->>'columnSpan')::integer, 0) not between 1 and p_columns_per_row
      or cell->>'height' not in ('normal','tall') or cell->>'textSize' not in ('normal','small')
      or (cell ? 'style' and cell->>'style' not in ('normal','emphasis','double-border','shaded','dashed'))
      or (cell ? 'contentColumns' and coalesce((cell->>'contentColumns')::integer, 0) not between 1 and 3)
      or cell->>'separator' not in ('new-line','slash'))
  then raise exception 'Invalid production print cell configuration.'; end if;
  if p_garment_type_id is not null and not exists (
    select 1 from public.catalog_garment_types garment
    where garment.id = p_garment_type_id and garment.order_section = p_order_section
  ) then raise exception 'Garment does not belong to this Order Details category.'; end if;

  select id into v_id
  from public.production_print_layouts
  where tenant_id = v_tenant and is_global
    and order_section = p_order_section
    and garment_type_id is not distinct from p_garment_type_id
  for update;
  if v_id is null then
    insert into public.production_print_layouts (
      tenant_id, shop_id, order_section, garment_type_id, columns_per_row, cells,
      is_global, is_active, created_by, updated_by
    ) values (
      v_tenant, v_shop, p_order_section, p_garment_type_id, p_columns_per_row, p_cells,
      true, true, auth.uid(), auth.uid()
    ) returning id into v_id;
  else
    update public.production_print_layouts set
      columns_per_row = p_columns_per_row,
      cells = p_cells,
      updated_by = auth.uid(),
      updated_at = now()
    where id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.set_production_print_layout_active(
  p_order_section text, p_garment_type_id uuid, p_is_active boolean
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.auth_has_permission('settings.manageShop')
     or not (public.auth_is_tenant_admin() or public.auth_has_permission('shops.viewAll'))
  then raise exception 'permission denied: tenant-wide production layout access required'; end if;
  update public.production_print_layouts
  set is_active = p_is_active, updated_by = auth.uid(), updated_at = now()
  where tenant_id = public.auth_user_tenant_id() and is_global
    and order_section = p_order_section
    and garment_type_id is not distinct from p_garment_type_id;
  if not found then raise exception 'Production print layout not found'; end if;
end;
$$;

create or replace function public.delete_production_print_layout(
  p_order_section text, p_garment_type_id uuid
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.auth_has_permission('settings.manageShop')
     or not (public.auth_is_tenant_admin() or public.auth_has_permission('shops.viewAll'))
  then raise exception 'permission denied: tenant-wide production layout access required'; end if;
  delete from public.production_print_layouts
  where tenant_id = public.auth_user_tenant_id() and is_global
    and order_section = p_order_section
    and garment_type_id is not distinct from p_garment_type_id;
end;
$$;

revoke all on function public.set_production_print_layout_active(text,uuid,boolean) from public;
grant execute on function public.set_production_print_layout_active(text,uuid,boolean) to authenticated;
revoke all on function public.save_production_print_layout(text,uuid,integer,jsonb) from public;
grant execute on function public.save_production_print_layout(text,uuid,integer,jsonb) to authenticated;
revoke all on function public.delete_production_print_layout(text,uuid) from public;
grant execute on function public.delete_production_print_layout(text,uuid) to authenticated;

commit;
