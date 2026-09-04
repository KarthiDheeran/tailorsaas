alter table public.catalog_garment_types
  add column if not exists show_work_details_customer_print boolean not null default false;

-- Preserve the requested initial behavior for existing garment types.
update public.catalog_garment_types
set show_work_details_customer_print = true,
    updated_at = now()
where order_section in ('Chudidar', 'Blouse')
  and show_work_details_customer_print = false;
