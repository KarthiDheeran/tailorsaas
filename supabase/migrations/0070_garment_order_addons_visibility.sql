alter table public.catalog_garment_types
  add column if not exists show_order_addons boolean not null default true;

create or replace function public.save_garment_type_configuration(
  p_garment_type_id uuid,
  p_name text,
  p_order_section text,
  p_shortcut_code integer,
  p_base_price numeric,
  p_addon_ids uuid[],
  p_show_order_addons boolean,
  p_is_active boolean,
  p_legacy_measurement_field_ids text[],
  p_field_assignments jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_garment_id uuid;
begin
  if not public.auth_has_permission('catalog.manage') then
    raise exception 'permission denied: catalog.manage required';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'garment name is required';
  end if;
  if p_order_section not in ('Men', 'Chudidar', 'Blouse') then
    raise exception 'invalid order section';
  end if;
  if p_base_price is null or p_base_price < 0 then
    raise exception 'base price must be zero or greater';
  end if;
  if p_is_active and (p_shortcut_code is null or p_shortcut_code <= 0) then
    raise exception 'numeric code is required for active garment types';
  end if;
  if jsonb_typeof(coalesce(p_field_assignments, '[]'::jsonb)) <> 'array' then
    raise exception 'field assignments must be an array';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_field_assignments, '[]'::jsonb)) assignment
    group by assignment->>'fieldId'
    having count(*) > 1
  ) then
    raise exception 'duplicate field assignments are not allowed';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_field_assignments, '[]'::jsonb)) assignment
    left join public.catalog_fields field on field.id = nullif(assignment->>'fieldId', '')::uuid
    where field.id is null or not field.is_active
  ) then
    raise exception 'each assigned field must exist and be active';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_addon_ids, '{}'::uuid[])) addon_id
    left join public.catalog_addons addon on addon.id = addon_id
    where addon.id is null
  ) then
    raise exception 'unknown add-on';
  end if;

  if p_garment_type_id is null then
    insert into public.catalog_garment_types (
      name, order_section, shortcut_code, base_price, measurement_field_ids,
      addon_ids, show_order_addons, is_active
    ) values (
      btrim(p_name), p_order_section, p_shortcut_code, p_base_price,
      coalesce(p_legacy_measurement_field_ids, '{}'::text[]),
      coalesce(p_addon_ids, '{}'::uuid[]), coalesce(p_show_order_addons, true), p_is_active
    ) returning id into v_garment_id;
  else
    update public.catalog_garment_types
    set
      name = btrim(p_name),
      order_section = p_order_section,
      shortcut_code = p_shortcut_code,
      base_price = p_base_price,
      measurement_field_ids = coalesce(p_legacy_measurement_field_ids, '{}'::text[]),
      addon_ids = coalesce(p_addon_ids, '{}'::uuid[]),
      show_order_addons = coalesce(p_show_order_addons, true),
      is_active = p_is_active,
      updated_at = now()
    where id = p_garment_type_id
    returning id into v_garment_id;

    if v_garment_id is null then
      raise exception 'garment type not found';
    end if;
  end if;

  delete from public.garment_type_fields where garment_type_id = v_garment_id;

  insert into public.garment_type_fields (
    garment_type_id, field_id, section_id, display_order, is_required, default_value
  )
  select
    v_garment_id,
    (assignment->>'fieldId')::uuid,
    nullif(assignment->>'sectionId', '')::uuid,
    greatest(coalesce((assignment->>'displayOrder')::integer, 1), 1),
    coalesce((assignment->>'isRequired')::boolean, false),
    assignment->'defaultValue'
  from jsonb_array_elements(coalesce(p_field_assignments, '[]'::jsonb)) assignment
  order by greatest(coalesce((assignment->>'displayOrder')::integer, 1), 1);

  return v_garment_id;
end;
$$;

grant execute on function public.save_garment_type_configuration(
  uuid, text, text, integer, numeric, uuid[], boolean, boolean, text[], jsonb
) to authenticated, service_role;
