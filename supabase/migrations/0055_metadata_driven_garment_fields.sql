-- Metadata-driven garment form foundation.
--
-- This migration intentionally keeps catalog_garment_types.measurement_field_ids
-- and order_items.measurements in place. Existing orders continue to read and
-- print exactly as before while the application moves, in later phases, to the
-- new catalog_fields + garment_type_fields schema.

create table if not exists catalog_sections (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  display_order integer not null default 1 check (display_order >= 1),
  icon text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists catalog_fields (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  field_type text not null check (field_type in ('measurement', 'style', 'instruction')),
  default_section_id uuid references catalog_sections(id) on delete set null,
  input_type text not null check (input_type in ('number', 'text', 'textarea', 'select', 'multiselect', 'checkbox')),
  unit text,
  placeholder text,
  options_json jsonb not null default '[]'::jsonb check (jsonb_typeof(options_json) = 'array'),
  ui_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(ui_metadata) = 'object'),
  min_value numeric,
  max_value numeric,
  decimal_places integer check (decimal_places between 0 and 6),
  is_required_default boolean not null default false,
  display_order integer not null default 1 check (display_order >= 1),
  is_active boolean not null default true,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_value is null or max_value is null or min_value <= max_value)
);

create unique index if not exists catalog_fields_code_lower_key
  on catalog_fields (lower(code));
create index if not exists catalog_fields_active_type_order_idx
  on catalog_fields (field_type, display_order, name)
  where is_active = true;
create index if not exists catalog_fields_section_order_idx
  on catalog_fields (default_section_id, display_order, name);

create table if not exists garment_type_fields (
  id uuid primary key default gen_random_uuid(),
  garment_type_id uuid not null references catalog_garment_types(id) on delete cascade,
  field_id uuid not null references catalog_fields(id) on delete restrict,
  section_id uuid references catalog_sections(id) on delete set null,
  display_order integer not null default 1 check (display_order >= 1),
  is_required boolean not null default false,
  default_value jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (garment_type_id, field_id)
);

create index if not exists garment_type_fields_garment_order_idx
  on garment_type_fields (garment_type_id, display_order);
create index if not exists garment_type_fields_garment_section_order_idx
  on garment_type_fields (garment_type_id, section_id, display_order);
create index if not exists garment_type_fields_field_idx
  on garment_type_fields (field_id);

-- RLS protects normal application access. This trigger also protects system
-- field identities if a privileged maintenance connection is used directly.
create or replace function protect_system_catalog_fields() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' and old.is_system then
    raise exception 'System catalog fields cannot be deleted';
  end if;

  if tg_op = 'UPDATE' and old.is_system then
    if new.code is distinct from old.code then
      raise exception 'System catalog field codes cannot be changed';
    end if;
    if old.is_active and not new.is_active then
      raise exception 'System catalog fields cannot be deactivated';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists catalog_fields_protect_system_fields on catalog_fields;
create trigger catalog_fields_protect_system_fields
  before update or delete on catalog_fields
  for each row execute function protect_system_catalog_fields();

-- Schema snapshots ensure a historical order remains readable even after an
-- administrator renames a configurable field. They remain nullable until the
-- runtime form writer is switched in Phase 3.
alter table order_items
  add column if not exists field_schema_snapshot jsonb;
alter table job_cards
  add column if not exists field_schema_snapshot jsonb;
alter table public.job_card_stage_slips
  add column if not exists field_schema_snapshot jsonb;

alter table catalog_sections enable row level security;
alter table catalog_fields enable row level security;
alter table garment_type_fields enable row level security;

drop policy if exists catalog_sections_select on catalog_sections;
drop policy if exists catalog_sections_insert on catalog_sections;
drop policy if exists catalog_sections_update on catalog_sections;
drop policy if exists catalog_fields_select on catalog_fields;
drop policy if exists catalog_fields_insert on catalog_fields;
drop policy if exists catalog_fields_update on catalog_fields;
drop policy if exists garment_type_fields_select on garment_type_fields;
drop policy if exists garment_type_fields_insert on garment_type_fields;
drop policy if exists garment_type_fields_update on garment_type_fields;
drop policy if exists garment_type_fields_delete on garment_type_fields;

create policy catalog_sections_select on catalog_sections for select
  using (auth_has_permission('catalog.view'));
create policy catalog_sections_insert on catalog_sections for insert
  with check (auth_has_permission('catalog.manage'));
create policy catalog_sections_update on catalog_sections for update
  using (auth_has_permission('catalog.manage'))
  with check (auth_has_permission('catalog.manage'));

create policy catalog_fields_select on catalog_fields for select
  using (auth_has_permission('catalog.view'));
create policy catalog_fields_insert on catalog_fields for insert
  with check (auth_has_permission('catalog.manage'));
create policy catalog_fields_update on catalog_fields for update
  using (auth_has_permission('catalog.manage'))
  with check (auth_has_permission('catalog.manage'));

create policy garment_type_fields_select on garment_type_fields for select
  using (auth_has_permission('catalog.view'));
create policy garment_type_fields_insert on garment_type_fields for insert
  with check (auth_has_permission('catalog.manage'));
create policy garment_type_fields_update on garment_type_fields for update
  using (auth_has_permission('catalog.manage'))
  with check (auth_has_permission('catalog.manage'));
create policy garment_type_fields_delete on garment_type_fields for delete
  using (auth_has_permission('catalog.manage'));

grant select, insert, update on catalog_sections, catalog_fields to authenticated, service_role;
grant select, insert, update, delete on garment_type_fields to authenticated, service_role;

insert into catalog_sections (name, display_order, icon, is_active)
values
  ('Body Measurements', 10, 'Ruler', true),
  ('Pocket & Style', 20, 'Shirt', true),
  ('Tailor Instructions', 30, 'MessageSquareText', true),
  ('Extras', 40, 'CirclePlus', true)
on conflict (name) do update set
  display_order = excluded.display_order,
  icon = excluded.icon,
  is_active = true,
  updated_at = now();

-- System fields are a stable starting vocabulary. Their codes are deliberately
-- immutable in the application because order schema snapshots use these keys.
with section_ids as (
  select name, id from catalog_sections
), seed(code, name, field_type, section_name, input_type, unit, options_json, display_order) as (
  values
    ('height', 'Height', 'measurement', 'Body Measurements', 'number', 'inch', '[]'::jsonb, 10),
    ('shoulder', 'Shoulder', 'measurement', 'Body Measurements', 'number', 'inch', '[]'::jsonb, 20),
    ('sleeve_length', 'Sleeve Length', 'measurement', 'Body Measurements', 'number', 'inch', '[]'::jsonb, 30),
    ('sleeve_loose', 'Sleeve Loose', 'measurement', 'Body Measurements', 'number', 'inch', '[]'::jsonb, 40),
    ('collar', 'Collar', 'measurement', 'Body Measurements', 'number', 'inch', '[]'::jsonb, 50),
    ('body_length', 'Body Length', 'measurement', 'Body Measurements', 'number', 'inch', '[]'::jsonb, 60),
    ('stomach', 'Stomach', 'measurement', 'Body Measurements', 'number', 'inch', '[]'::jsonb, 70),
    ('waist', 'Waist', 'measurement', 'Body Measurements', 'number', 'inch', '[]'::jsonb, 80),
    ('front_pocket', 'Front Pocket', 'measurement', 'Body Measurements', 'number', 'inch', '[]'::jsonb, 90),
    ('collar_size', 'Collar Size', 'measurement', 'Body Measurements', 'number', 'inch', '[]'::jsonb, 100),
    ('cuff', 'Cuff', 'measurement', 'Body Measurements', 'number', 'inch', '[]'::jsonb, 110),
    ('seat', 'Seat', 'measurement', 'Body Measurements', 'number', 'inch', '[]'::jsonb, 120),
    ('front_fork', 'Front Fork', 'measurement', 'Body Measurements', 'number', 'inch', '[]'::jsonb, 130),
    ('back_fork', 'Back Fork', 'measurement', 'Body Measurements', 'number', 'inch', '[]'::jsonb, 140),
    ('thigh_loose', 'Thigh Loose', 'measurement', 'Body Measurements', 'number', 'inch', '[]'::jsonb, 150),
    ('knee_loose', 'Knee Loose', 'measurement', 'Body Measurements', 'number', 'inch', '[]'::jsonb, 160),
    ('ankle_loose', 'Ankle Loose', 'measurement', 'Body Measurements', 'number', 'inch', '[]'::jsonb, 170),
    ('seat_loose', 'Seat Loose', 'measurement', 'Body Measurements', 'number', 'inch', '[]'::jsonb, 180),
    ('side_pocket', 'Side Pocket', 'style', 'Pocket & Style', 'select', null, jsonb_build_array('கிராஸ் பாக்கெட்', 'சாதா பாக்கெட்', 'TP 1'), 10),
    ('hip_pocket', 'Hip Pocket', 'style', 'Pocket & Style', 'select', null, jsonb_build_array('TP 1', '2 கட் பாக்கெட்'), 20),
    ('ticket_pocket', 'Ticket Pocket', 'style', 'Pocket & Style', 'select', null, jsonb_build_array('tpoc1'), 30),
    ('quick_addon', 'Quick Add-on', 'instruction', 'Tailor Instructions', 'multiselect', null, '[]'::jsonb, 10),
    ('final_instructions', 'Final Instructions', 'instruction', 'Tailor Instructions', 'textarea', null, '[]'::jsonb, 20),
    ('r1', 'R1 (Sleeve)', 'instruction', 'Tailor Instructions', 'select', null, jsonb_build_array('பட்டி மடிப்பு', 'உள் பட்டி மடிப்பு', '1 இஞ்ச் பட்டி மடிப்பு'), 30),
    ('r2', 'R2', 'instruction', 'Tailor Instructions', 'select', null, jsonb_build_array('2 தையல்', '1/2 இஞ்ச் தையல்', 'அனைத்தும் 2 தையல்'), 40),
    ('r3', 'R3', 'instruction', 'Tailor Instructions', 'select', null, jsonb_build_array('உள் பாக்கெட்', 'ஒரு பாக்கெட்'), 50),
    ('r4', 'R4', 'instruction', 'Tailor Instructions', 'select', null, jsonb_build_array('கட் சர்ட்'), 60)
)
insert into catalog_fields (
  code, name, field_type, default_section_id, input_type, unit, options_json,
  decimal_places, is_required_default, display_order, is_active, is_system
)
select
  seed.code, seed.name, seed.field_type, section_ids.id, seed.input_type, seed.unit,
  seed.options_json, case when seed.input_type = 'number' then 2 else null end,
  false, seed.display_order, true, true
from seed
join section_ids on section_ids.name = seed.section_name
on conflict (code) do update set
  name = excluded.name,
  field_type = excluded.field_type,
  default_section_id = excluded.default_section_id,
  input_type = excluded.input_type,
  unit = excluded.unit,
  options_json = excluded.options_json,
  decimal_places = excluded.decimal_places,
  display_order = excluded.display_order,
  is_system = true,
  updated_at = now();

-- Preserve every legacy selected field as a metadata record and map it to its
-- original garments. Existing IDs remain valid in legacy arrays; this merely
-- makes the same field available to the new metadata renderer.
with legacy_fields as (
  select distinct unnest(coalesce(measurement_field_ids, '{}'::text[])) as code
  from catalog_garment_types
), body_section as (
  select id from catalog_sections where name = 'Body Measurements'
)
insert into catalog_fields (
  code, name, field_type, default_section_id, input_type, options_json,
  decimal_places, display_order, is_active, is_system
)
select
  legacy_fields.code,
  case
    when legacy_fields.code like 'custom:%' then nullif(trim(substr(legacy_fields.code, 8)), '')
    else initcap(regexp_replace(legacy_fields.code, '([a-z])([A-Z])', '\\1 \\2', 'g'))
  end,
  'measurement', body_section.id,
  case when legacy_fields.code in ('fitNotes', 'notes') then 'textarea' else 'number' end,
  '[]'::jsonb,
  case when legacy_fields.code in ('fitNotes', 'notes') then null else 2 end,
  500, true, false
from legacy_fields
cross join body_section
where legacy_fields.code <> ''
on conflict (code) do nothing;

insert into garment_type_fields (
  garment_type_id, field_id, section_id, display_order, is_required, default_value
)
select
  garments.id,
  fields.id,
  coalesce(fields.default_section_id, body.id),
  legacy.ordinality::integer,
  false,
  null
from catalog_garment_types garments
cross join lateral unnest(coalesce(garments.measurement_field_ids, '{}'::text[])) with ordinality as legacy(code, ordinality)
join catalog_fields fields on fields.code = legacy.code
left join catalog_sections body on body.name = 'Body Measurements'
on conflict (garment_type_id, field_id) do nothing;

-- Required starter mappings. This is seed configuration only; runtime code
-- will read garment_type_fields rather than branch on a garment name.
with requested(garment_name, field_code, section_name, display_order) as (
  values
    ('Half Shirt', 'height', 'Body Measurements', 10), ('Half Shirt', 'shoulder', 'Body Measurements', 20), ('Half Shirt', 'sleeve_length', 'Body Measurements', 30), ('Half Shirt', 'sleeve_loose', 'Body Measurements', 40), ('Half Shirt', 'collar', 'Body Measurements', 50), ('Half Shirt', 'body_length', 'Body Measurements', 60), ('Half Shirt', 'stomach', 'Body Measurements', 70), ('Half Shirt', 'waist', 'Body Measurements', 80), ('Half Shirt', 'front_pocket', 'Body Measurements', 90), ('Half Shirt', 'collar_size', 'Body Measurements', 100),
    ('Full Shirt', 'height', 'Body Measurements', 10), ('Full Shirt', 'shoulder', 'Body Measurements', 20), ('Full Shirt', 'sleeve_length', 'Body Measurements', 30), ('Full Shirt', 'sleeve_loose', 'Body Measurements', 40), ('Full Shirt', 'collar', 'Body Measurements', 50), ('Full Shirt', 'body_length', 'Body Measurements', 60), ('Full Shirt', 'stomach', 'Body Measurements', 70), ('Full Shirt', 'waist', 'Body Measurements', 80), ('Full Shirt', 'front_pocket', 'Body Measurements', 90), ('Full Shirt', 'collar_size', 'Body Measurements', 100), ('Full Shirt', 'cuff', 'Body Measurements', 110),
    ('Safari', 'height', 'Body Measurements', 10), ('Safari', 'shoulder', 'Body Measurements', 20), ('Safari', 'sleeve_length', 'Body Measurements', 30), ('Safari', 'sleeve_loose', 'Body Measurements', 40), ('Safari', 'collar', 'Body Measurements', 50), ('Safari', 'body_length', 'Body Measurements', 60), ('Safari', 'stomach', 'Body Measurements', 70), ('Safari', 'waist', 'Body Measurements', 80), ('Safari', 'front_pocket', 'Body Measurements', 90), ('Safari', 'collar_size', 'Body Measurements', 100),
    ('Coat', 'height', 'Body Measurements', 10), ('Coat', 'shoulder', 'Body Measurements', 20), ('Coat', 'sleeve_length', 'Body Measurements', 30), ('Coat', 'sleeve_loose', 'Body Measurements', 40), ('Coat', 'collar', 'Body Measurements', 50), ('Coat', 'body_length', 'Body Measurements', 60), ('Coat', 'stomach', 'Body Measurements', 70), ('Coat', 'waist', 'Body Measurements', 80), ('Coat', 'front_pocket', 'Body Measurements', 90), ('Coat', 'collar_size', 'Body Measurements', 100), ('Coat', 'cuff', 'Body Measurements', 110),
    ('Half pant', 'height', 'Body Measurements', 10), ('Half pant', 'waist', 'Body Measurements', 20), ('Half pant', 'seat', 'Body Measurements', 30), ('Half pant', 'front_fork', 'Body Measurements', 40), ('Half pant', 'back_fork', 'Body Measurements', 50), ('Half pant', 'thigh_loose', 'Body Measurements', 60), ('Half pant', 'knee_loose', 'Body Measurements', 70), ('Half pant', 'ankle_loose', 'Body Measurements', 80), ('Half pant', 'seat_loose', 'Body Measurements', 90),
    ('Pant', 'height', 'Body Measurements', 10), ('Pant', 'waist', 'Body Measurements', 20), ('Pant', 'seat', 'Body Measurements', 30), ('Pant', 'front_fork', 'Body Measurements', 40), ('Pant', 'back_fork', 'Body Measurements', 50), ('Pant', 'thigh_loose', 'Body Measurements', 60), ('Pant', 'knee_loose', 'Body Measurements', 70), ('Pant', 'ankle_loose', 'Body Measurements', 80), ('Pant', 'seat_loose', 'Body Measurements', 90),
    ('Skirt', 'height', 'Body Measurements', 10), ('Skirt', 'waist', 'Body Measurements', 20), ('Skirt', 'seat', 'Body Measurements', 30), ('Skirt', 'front_fork', 'Body Measurements', 40), ('Skirt', 'back_fork', 'Body Measurements', 50), ('Skirt', 'thigh_loose', 'Body Measurements', 60), ('Skirt', 'knee_loose', 'Body Measurements', 70), ('Skirt', 'ankle_loose', 'Body Measurements', 80), ('Skirt', 'seat_loose', 'Body Measurements', 90)
), instruction_fields(field_code, display_order) as (
  values ('quick_addon', 10), ('final_instructions', 20), ('r1', 30), ('r2', 40), ('r3', 50), ('r4', 60)
), all_requested as (
  select garment_name, field_code, section_name, display_order from requested
  union all
  select garment_name, instruction_fields.field_code, 'Tailor Instructions', instruction_fields.display_order
  from (values ('Half Shirt'), ('Full Shirt'), ('Safari'), ('Coat')) shirts(garment_name)
  cross join instruction_fields
  union all
  select garment_name, field_code, 'Pocket & Style', display_order
  from (values ('Half pant'), ('Pant'), ('Skirt')) pants(garment_name)
  cross join (values ('side_pocket', 10), ('hip_pocket', 20), ('ticket_pocket', 30)) pockets(field_code, display_order)
  union all
  select garment_name, field_code, 'Tailor Instructions', display_order
  from (values ('Half pant'), ('Pant'), ('Skirt')) pants(garment_name)
  cross join (values ('quick_addon', 10), ('final_instructions', 20)) instructions(field_code, display_order)
)
insert into garment_type_fields (
  garment_type_id, field_id, section_id, display_order, is_required, default_value
)
select garments.id, fields.id, sections.id, all_requested.display_order, false, null
from all_requested
join catalog_garment_types garments on lower(garments.name) = lower(all_requested.garment_name)
join catalog_fields fields on fields.code = all_requested.field_code
join catalog_sections sections on sections.name = all_requested.section_name
on conflict (garment_type_id, field_id) do update set
  section_id = excluded.section_id,
  display_order = excluded.display_order,
  updated_at = now();
