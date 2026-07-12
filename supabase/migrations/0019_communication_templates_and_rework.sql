-- Phase 14A: communication templates + richer production reasons.
--
-- Templates keep reminder wording configurable without adding a marketing
-- module. Activity-log action types are extended so delay/rework reasons are
-- first-class production history events.

create table if not exists communication_templates (
  template_type text primary key check (
    template_type in (
      'Delivery Reminder',
      'Trial Reminder',
      'Payment Reminder',
      'Production Reminder',
      'Delay Notice',
      'Rework Notice'
    )
  ),
  title text not null,
  body text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null
);

insert into communication_templates (template_type, title, body, active)
values
  (
    'Delivery Reminder',
    'Delivery Reminder',
    'Hi {{customer_name}}, your order {{order_number}} is scheduled for delivery on {{date}}.',
    true
  ),
  (
    'Trial Reminder',
    'Trial Reminder',
    'Hi {{customer_name}}, this is a reminder for your trial on {{date}} for order {{order_number}}.',
    true
  ),
  (
    'Payment Reminder',
    'Payment Reminder',
    'Hi {{customer_name}}, payment of Rs {{balance}} is pending for order {{order_number}}.',
    true
  ),
  (
    'Production Reminder',
    'Production Reminder',
    '{{job_card_number}} ({{garment}}) is due on {{date}}{{assigned_staff_text}}.',
    true
  ),
  (
    'Delay Notice',
    'Delay Notice',
    'Hi {{customer_name}}, your order {{order_number}} is delayed. Reason: {{reason}}.',
    true
  ),
  (
    'Rework Notice',
    'Rework / Alteration Notice',
    'Hi {{customer_name}}, your order {{order_number}} needs alteration/rework. Reason: {{reason}}.',
    true
  )
on conflict (template_type) do nothing;

alter table communication_templates enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'communication_templates'
      and policyname = 'communication_templates_select'
  ) then
    create policy communication_templates_select on communication_templates for select
      using (
        auth_has_permission('calendar.view')
        or auth_has_permission('orders.view')
        or auth_has_permission('customers.view')
        or auth_has_permission('settings.view')
      );
  end if;
end $$;

grant select on communication_templates to authenticated, service_role;

create or replace function save_communication_template(
  p_template_type text,
  p_body text,
  p_active boolean
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text;
begin
  if not auth_has_permission('settings.manageShop') then
    raise exception 'permission denied: settings.manageShop required';
  end if;

  if p_template_type not in (
    'Delivery Reminder',
    'Trial Reminder',
    'Payment Reminder',
    'Production Reminder',
    'Delay Notice',
    'Rework Notice'
  ) then
    raise exception 'invalid template type: %', p_template_type;
  end if;

  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'template body is required';
  end if;

  v_title := case p_template_type
    when 'Rework Notice' then 'Rework / Alteration Notice'
    else p_template_type
  end;

  insert into communication_templates (
    template_type,
    title,
    body,
    active,
    updated_at,
    updated_by
  )
  values (
    p_template_type,
    v_title,
    trim(p_body),
    coalesce(p_active, true),
    now(),
    auth.uid()
  )
  on conflict (template_type) do update set
    body = excluded.body,
    active = excluded.active,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;
end;
$$;

grant execute on function save_communication_template(text, text, boolean) to authenticated, service_role;

alter table job_card_activity_logs
  drop constraint if exists job_card_activity_logs_action_type_check;

alter table job_card_activity_logs
  add constraint job_card_activity_logs_action_type_check
  check (action_type in (
    'Assigned',
    'Started',
    'Stage Moved',
    'Completed',
    'Delayed',
    'Rework'
  ));
