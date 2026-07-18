create table if not exists staff_work_earnings (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete restrict,
  job_card_id uuid not null references job_cards(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  job_card_number text not null,
  task_type text not null check (task_type in
    ('Measurement','Cutting','Stitching','Embroidery','Finishing','Alteration','Ironing/Packing','Delivery')),
  completed_date date not null,
  wage_rate numeric not null default 0,
  wage_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (job_card_id, staff_id, task_type, completed_date)
);

alter table staff_work_earnings enable row level security;

create policy staff_work_earnings_select on staff_work_earnings for select
  using (auth_has_permission('staff.view'));
create policy staff_work_earnings_insert on staff_work_earnings for insert
  with check (auth_has_permission('staff.manage'));

grant select, insert on staff_work_earnings to authenticated, service_role;
