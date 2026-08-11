-- Allow catalog fields to define repeatable measurement/detail tables.
-- Used for garments like Chudidar/Blouse where one measurement section is a
-- small grid with per-column dropdown values, qty, tailor amount, and totals.

alter table public.catalog_fields
  drop constraint if exists catalog_fields_input_type_check;

alter table public.catalog_fields
  add constraint catalog_fields_input_type_check
  check (input_type in ('number', 'text', 'textarea', 'select', 'multiselect', 'checkbox', 'table'));
