-- Customer communication templates for WhatsApp-first tailoring workflows.
-- Adds order confirmation, ready-for-pickup, feedback, and promotional
-- messages without introducing a heavy campaign/automation module.

alter table communication_templates
  drop constraint if exists communication_templates_template_type_check;

alter table communication_templates
  add constraint communication_templates_template_type_check
  check (
    template_type in (
      'Order Confirmation',
      'Delivery Reminder',
      'Trial Reminder',
      'Payment Reminder',
      'Ready for Pickup',
      'Feedback Request',
      'Promotional Message',
      'Production Reminder',
      'Delay Notice',
      'Rework Notice'
    )
  );

insert into communication_templates (
  template_type,
  title,
  body,
  active,
  whatsapp_enabled,
  sms_enabled,
  email_enabled
)
values
  (
    'Order Confirmation',
    'Order Confirmation',
    'Hi {{customer_name}}, your order {{order_number}} has been confirmed. Delivery date: {{date}}.',
    true,
    true,
    false,
    false
  ),
  (
    'Ready for Pickup',
    'Ready for Pickup',
    'Hi {{customer_name}}, your order {{order_number}} is ready for pickup. Balance due: Rs {{balance}}.',
    true,
    true,
    false,
    false
  ),
  (
    'Feedback Request',
    'Feedback Request',
    'Hi {{customer_name}}, thank you for choosing us. Please share your feedback for order {{order_number}}.',
    true,
    true,
    false,
    false
  ),
  (
    'Promotional Message',
    'Promotional Message',
    'Hi {{customer_name}}, we have new tailoring offers and styles available. Reply here to book your next order.',
    true,
    true,
    false,
    false
  )
on conflict (template_type) do nothing;

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
    'Order Confirmation',
    'Delivery Reminder',
    'Trial Reminder',
    'Payment Reminder',
    'Ready for Pickup',
    'Feedback Request',
    'Promotional Message',
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
    title = excluded.title,
    body = excluded.body,
    active = excluded.active,
    whatsapp_enabled = excluded.whatsapp_enabled,
    sms_enabled = excluded.sms_enabled,
    email_enabled = excluded.email_enabled,
    updated_at = now(),
    updated_by = auth.uid();
end;
$$;

grant execute on function save_communication_template(text, text, boolean, boolean, boolean, boolean)
  to authenticated, service_role;
