-- Phase 8B: operational calendar reminders.
--
-- Calendar events are derived from existing orders/job_cards. This table only
-- records whether a reminder was sent for a derived event key, so it avoids
-- duplicating delivery/trial/production dates into a second source of truth.

create table calendar_reminders (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  reminder_type text not null check (reminder_type in ('Delivery','Trial','Production','Payment')),
  target_type text not null check (target_type in ('Order','Job Card')),
  target_id uuid,
  reminder_date date not null,
  message text not null,
  sent_at timestamptz not null default now(),
  sent_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table calendar_reminders enable row level security;

create policy calendar_reminders_select on calendar_reminders for select
  using (auth_has_permission('calendar.view'));

-- Writes go through mark_calendar_reminder_sent(), which stamps sent_by from
-- auth.uid() and keeps one row per derived event key.
grant select on calendar_reminders to authenticated, service_role;

create function mark_calendar_reminder_sent(
  p_event_key text,
  p_reminder_type text,
  p_target_type text,
  p_target_id uuid,
  p_reminder_date date,
  p_message text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not auth_has_permission('calendar.view') then
    raise exception 'permission denied: calendar.view required';
  end if;

  if p_event_key is null or length(trim(p_event_key)) = 0 then
    raise exception 'event key is required';
  end if;

  insert into calendar_reminders (
    event_key, reminder_type, target_type, target_id, reminder_date, message, sent_by
  ) values (
    p_event_key, p_reminder_type, p_target_type, p_target_id, p_reminder_date, p_message, auth.uid()
  )
  on conflict (event_key) do update set
    reminder_type = excluded.reminder_type,
    target_type = excluded.target_type,
    target_id = excluded.target_id,
    reminder_date = excluded.reminder_date,
    message = excluded.message,
    sent_at = now(),
    sent_by = auth.uid(),
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function mark_calendar_reminder_sent(text, text, text, uuid, date, text) to authenticated, service_role;

update roles
set permissions = permissions || array['calendar.view']::text[]
where id in ('role-admin', 'role-manager')
  and not ('calendar.view' = any(permissions));
