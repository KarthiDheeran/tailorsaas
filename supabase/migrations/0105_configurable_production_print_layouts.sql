begin;

create table public.production_print_layouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  order_section text not null check (order_section in ('Men','Chudidar','Blouse')),
  garment_type_id uuid references public.catalog_garment_types(id) on delete cascade,
  columns_per_row integer not null default 6 check (columns_per_row between 4 and 8),
  cells jsonb not null default '[]'::jsonb check (jsonb_typeof(cells) = 'array' and jsonb_array_length(cells) <= 60),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index production_print_layouts_section_default_unique
  on public.production_print_layouts (tenant_id, shop_id, order_section) where garment_type_id is null;
create unique index production_print_layouts_garment_unique
  on public.production_print_layouts (tenant_id, shop_id, order_section, garment_type_id) where garment_type_id is not null;

alter table public.production_print_layouts enable row level security;
create policy production_print_layouts_select on public.production_print_layouts for select using (
  auth.uid() is not null and tenant_id = public.auth_user_tenant_id()
  and (shop_id = public.auth_user_shop_id() or public.auth_is_tenant_admin())
  and public.auth_can_access_scope(tenant_id, shop_id, order_section)
  and (public.auth_has_permission('settings.view') or public.auth_has_permission('orders.printJobCard'))
);
create policy production_print_layouts_delete on public.production_print_layouts for delete using (
  auth.uid() is not null and tenant_id = public.auth_user_tenant_id() and shop_id = public.auth_user_shop_id()
  and public.auth_can_access_scope(tenant_id, shop_id, order_section)
  and public.auth_has_permission('settings.manageShop')
);
grant select, delete on public.production_print_layouts to authenticated, service_role;

create function public.save_production_print_layout(
  p_order_section text, p_garment_type_id uuid, p_columns_per_row integer, p_cells jsonb
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := public.auth_user_tenant_id();
  v_shop uuid := public.auth_user_shop_id();
  v_id uuid;
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
  if p_garment_type_id is not null and not exists (select 1 from public.catalog_garment_types g
      where g.id = p_garment_type_id and g.order_section = p_order_section) then raise exception 'Garment does not belong to this Order Details category.'; end if;
  select id into v_id from public.production_print_layouts where tenant_id=v_tenant and shop_id=v_shop
    and order_section=p_order_section and garment_type_id is not distinct from p_garment_type_id for update;
  if v_id is null then
    insert into public.production_print_layouts(tenant_id,shop_id,order_section,garment_type_id,columns_per_row,cells,created_by,updated_by)
    values(v_tenant,v_shop,p_order_section,p_garment_type_id,p_columns_per_row,p_cells,auth.uid(),auth.uid()) returning id into v_id;
  else
    update public.production_print_layouts set columns_per_row=p_columns_per_row,cells=p_cells,updated_by=auth.uid(),updated_at=now() where id=v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.save_production_print_layout(text,uuid,integer,jsonb) from public;
grant execute on function public.save_production_print_layout(text,uuid,integer,jsonb) to authenticated;

alter table public.job_card_stage_slips add column production_layout_snapshot jsonb;

commit;
