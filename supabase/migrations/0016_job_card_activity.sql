-- Phase 13A: job card production activity history.
--
-- Job cards hold the current workshop state. This table records the important
-- transitions so managers can answer who assigned/started/moved/completed a
-- card and when.

create table job_card_activity_logs (
  id uuid primary key default gen_random_uuid(),
  job_card_id uuid not null references job_cards(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  action_type text not null check (action_type in ('Assigned','Started','Stage Moved','Completed')),
  from_stage text,
  to_stage text,
  assigned_staff_id uuid references staff(id) on delete set null,
  notes text,
  performed_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index job_card_activity_logs_card_idx on job_card_activity_logs (job_card_id, created_at desc);
create index job_card_activity_logs_order_idx on job_card_activity_logs (order_id, created_at desc);

alter table job_card_activity_logs enable row level security;

create policy job_card_activity_logs_select on job_card_activity_logs for select
  using (auth_has_permission('orders.view') or auth_has_permission('staff.view'));

grant select, insert on job_card_activity_logs to authenticated, service_role;
