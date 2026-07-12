-- Phase 14B: per-channel controls for communication templates.
--
-- `active` remains the master switch. Channel flags let the shop decide
-- which delivery mechanisms are allowed for each reminder/template type.

alter table communication_templates
  add column if not exists whatsapp_enabled boolean not null default true,
  add column if not exists sms_enabled boolean not null default false,
  add column if not exists email_enabled boolean not null default false;

update communication_templates
set
  whatsapp_enabled = coalesce(whatsapp_enabled, active),
  sms_enabled = coalesce(sms_enabled, false),
  email_enabled = coalesce(email_enabled, false);

drop function if exists save_communication_template(text, text, boolean);

create or replace function save_communication_template(
  p_template_type text,
  p_body text,
  p_active boolean,
  p_whatsapp_enabled boolean default true,
  p_sms_enabled boolean default false,
  p_email_enabled boolean default false
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
    whatsapp_enabled,
    sms_enabled,
    email_enabled,
    updated_at,
    updated_by
  )
  values (
    p_template_type,
    v_title,
    trim(p_body),
    coalesce(p_active, true),
    coalesce(p_whatsapp_enabled, true),
    coalesce(p_sms_enabled, false),
    coalesce(p_email_enabled, false),
    now(),
    auth.uid()
  )
  on conflict (template_type) do update set
    body = excluded.body,
    active = excluded.active,
    whatsapp_enabled = excluded.whatsapp_enabled,
    sms_enabled = excluded.sms_enabled,
    email_enabled = excluded.email_enabled,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;
end;
$$;

grant execute on function save_communication_template(text, text, boolean, boolean, boolean, boolean)
  to authenticated, service_role;
