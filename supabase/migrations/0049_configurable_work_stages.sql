-- Configurable production/work stages for job cards, worker rates, and
-- garment add-on labour pay mappings.

create table if not exists public.catalog_work_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stage_key text not null unique,
  display_order integer not null default 1 check (display_order >= 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.catalog_work_stages (name, stage_key, display_order, is_active)
values
  ('Measurement', 'Measurement', 1, true),
  ('Cutting', 'Cutting', 2, true),
  ('Stitching', 'Stitching', 3, true),
  ('Embroidery', 'Embroidery', 4, true),
  ('Finishing', 'Finishing', 5, true),
  ('Alteration', 'Alteration', 6, true),
  ('Ironing/Packing', 'Ironing/Packing', 7, true),
  ('Delivery', 'Delivery', 8, true)
on conflict (stage_key) do update
set
  name = excluded.name,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

alter table public.catalog_work_stages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'catalog_work_stages'
      and policyname = 'catalog_work_stages_select'
  ) then
    create policy catalog_work_stages_select on public.catalog_work_stages
      for select
      using (auth_has_permission('catalog.view'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'catalog_work_stages'
      and policyname = 'catalog_work_stages_insert'
  ) then
    create policy catalog_work_stages_insert on public.catalog_work_stages
      for insert
      with check (auth_has_permission('catalog.manage'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'catalog_work_stages'
      and policyname = 'catalog_work_stages_update'
  ) then
    create policy catalog_work_stages_update on public.catalog_work_stages
      for update
      using (auth_has_permission('catalog.manage'))
      with check (auth_has_permission('catalog.manage'));
  end if;
end $$;

grant select, insert, update on public.catalog_work_stages
  to authenticated, service_role;

-- Stages are now validated through catalog_work_stages in the application,
-- so legacy fixed CHECK constraints must not block shop-configured stages.
alter table public.work_assignments
  drop constraint if exists work_assignments_task_type_check;

alter table public.staff_work_earnings
  drop constraint if exists staff_work_earnings_task_type_check;

alter table public.job_card_stage_slips
  drop constraint if exists job_card_stage_slips_stage_check;
