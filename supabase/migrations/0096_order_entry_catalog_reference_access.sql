-- Order creators need read-only garment/add-on/form metadata to populate New
-- Order. This does not grant catalog.view, expose the Catalog management page,
-- or permit any catalog writes.

drop policy if exists catalog_garment_types_select on public.catalog_garment_types;
create policy catalog_garment_types_select on public.catalog_garment_types for select
  using (auth_has_permission('catalog.view') or auth_has_permission('orders.create'));

drop policy if exists catalog_addons_select on public.catalog_addons;
create policy catalog_addons_select on public.catalog_addons for select
  using (auth_has_permission('catalog.view') or auth_has_permission('orders.create'));

drop policy if exists catalog_sections_select on public.catalog_sections;
create policy catalog_sections_select on public.catalog_sections for select
  using (auth_has_permission('catalog.view') or auth_has_permission('orders.create'));

drop policy if exists catalog_fields_select on public.catalog_fields;
create policy catalog_fields_select on public.catalog_fields for select
  using (auth_has_permission('catalog.view') or auth_has_permission('orders.create'));

drop policy if exists garment_type_fields_select on public.garment_type_fields;
create policy garment_type_fields_select on public.garment_type_fields for select
  using (auth_has_permission('catalog.view') or auth_has_permission('orders.create'));
