-- Tenant admins configure production print layouts centrally. Copy existing
-- layouts to every active shop that supports the category, and keep future
-- admin saves/resets synchronized across those shops.
begin;

with source_layouts as (
  select distinct on (layout.tenant_id, layout.order_section, coalesce(layout.garment_type_id::text, ''))
    layout.*
  from public.production_print_layouts layout
  order by layout.tenant_id, layout.order_section, coalesce(layout.garment_type_id::text, ''), layout.updated_at desc
)
insert into public.production_print_layouts (
  tenant_id, shop_id, order_section, garment_type_id, columns_per_row, cells,
  created_by, updated_by, created_at, updated_at
)
select source.tenant_id, shop.id, source.order_section, source.garment_type_id,
  source.columns_per_row, source.cells, source.created_by, source.updated_by,
  source.created_at, source.updated_at
from source_layouts source
join public.shops shop on shop.tenant_id = source.tenant_id
  and shop.active
  and (
    shop.allowed_order_sections is null
    or cardinality(shop.allowed_order_sections) = 0
    or source.order_section = any(shop.allowed_order_sections)
  )
where not exists (
  select 1 from public.production_print_layouts existing
  where existing.tenant_id = source.tenant_id
    and existing.shop_id = shop.id
    and existing.order_section = source.order_section
    and existing.garment_type_id is not distinct from source.garment_type_id
);

create or replace function public.save_production_print_layout(
  p_order_section text, p_garment_type_id uuid, p_columns_per_row integer, p_cells jsonb
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := public.auth_user_tenant_id();
  v_shop uuid := public.auth_user_shop_id();
  v_target_shop uuid;
  v_id uuid;
  v_return_id uuid;
begin
  if not public.auth_has_permission('settings.manageShop') then raise exception 'permission denied: settings.manageShop required'; end if;
  if v_tenant is null or v_shop is null or p_order_section not in ('Men','Chudidar','Blouse')
     or not public.auth_can_access_scope(v_tenant, v_shop, p_order_section) then raise exception 'Invalid or inaccessible order section'; end if;
  if p_columns_per_row < 4 or p_columns_per_row > 8 then raise exception 'Columns per row must be between 4 and 8.'; end if;
  if jsonb_typeof(p_cells) <> 'array' or jsonb_array_length(p_cells) > 60 then raise exception 'Invalid production print cells.'; end if;
  if exists (select 1 from jsonb_array_elements(p_cells) cell where
      jsonb_typeof(cell->'fieldCodes') <> 'array' or jsonb_array_length(cell->'fieldCodes') not between 1 and 2
      or (jsonb_array_length(cell->'fieldCodes') > 1 and (cell->'fieldCodes') ?| array['__empty_box__','__blank_space__'])
      or coalesce((cell->>'columnSpan')::integer, 0) not between 1 and p_columns_per_row
      or cell->>'height' not in ('normal','tall') or cell->>'textSize' not in ('normal','small')
      or (cell ? 'style' and cell->>'style' not in ('normal','emphasis','double-border','shaded','dashed'))
      or (cell ? 'contentColumns' and coalesce((cell->>'contentColumns')::integer, 0) not between 1 and 3)
      or cell->>'separator' not in ('new-line','slash')) then raise exception 'Invalid production print cell configuration.'; end if;
  if p_garment_type_id is not null and not exists (select 1 from public.catalog_garment_types garment
      where garment.id = p_garment_type_id and garment.order_section = p_order_section) then raise exception 'Garment does not belong to this Order Details category.'; end if;

  for v_target_shop in
    select shop.id from public.shops shop
    where shop.tenant_id = v_tenant and (
      shop.id = v_shop or (
        public.auth_is_tenant_admin() and shop.active and (
          shop.allowed_order_sections is null
          or cardinality(shop.allowed_order_sections) = 0
          or p_order_section = any(shop.allowed_order_sections)
        )
      )
    )
  loop
    v_id := null;
    select id into v_id from public.production_print_layouts
    where tenant_id = v_tenant and shop_id = v_target_shop
      and order_section = p_order_section
      and garment_type_id is not distinct from p_garment_type_id
    for update;
    if v_id is null then
      insert into public.production_print_layouts (
        tenant_id, shop_id, order_section, garment_type_id, columns_per_row, cells, created_by, updated_by
      )
      values (v_tenant, v_target_shop, p_order_section, p_garment_type_id, p_columns_per_row, p_cells, auth.uid(), auth.uid())
      returning id into v_id;
    else
      update public.production_print_layouts set
        columns_per_row = p_columns_per_row, cells = p_cells,
        updated_by = auth.uid(), updated_at = now()
      where id = v_id;
    end if;
    if v_target_shop = v_shop or v_return_id is null then v_return_id := v_id; end if;
  end loop;
  return v_return_id;
end;
$$;

create function public.delete_production_print_layout(
  p_order_section text, p_garment_type_id uuid
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := public.auth_user_tenant_id();
  v_shop uuid := public.auth_user_shop_id();
begin
  if not public.auth_has_permission('settings.manageShop') then raise exception 'permission denied: settings.manageShop required'; end if;
  if v_tenant is null or v_shop is null or p_order_section not in ('Men','Chudidar','Blouse')
     or not public.auth_can_access_scope(v_tenant, v_shop, p_order_section) then raise exception 'Invalid or inaccessible order section'; end if;
  delete from public.production_print_layouts layout
  where layout.tenant_id = v_tenant
    and layout.order_section = p_order_section
    and layout.garment_type_id is not distinct from p_garment_type_id
    and (
      layout.shop_id = v_shop or (
        public.auth_is_tenant_admin() and exists (
          select 1 from public.shops shop
          where shop.id = layout.shop_id and shop.tenant_id = v_tenant and shop.active
            and (
              shop.allowed_order_sections is null
              or cardinality(shop.allowed_order_sections) = 0
              or p_order_section = any(shop.allowed_order_sections)
            )
        )
      )
    );
end;
$$;

revoke all on function public.delete_production_print_layout(text,uuid) from public;
grant execute on function public.delete_production_print_layout(text,uuid) to authenticated;

commit;
