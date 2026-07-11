-- Phase 12A: manual WhatsApp communication log.
--
-- The app opens WhatsApp through wa.me links. This table records that a
-- staff member opened/logged a message, but does not claim API delivery.
-- A future WhatsApp Business API integration can reuse this table and add
-- provider ids/webhook statuses.

create table whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  message text not null,
  context_type text not null check (context_type in ('Calendar','Order','Job Card','Customer','Delivery','Payment')),
  context_id uuid,
  status text not null check (status in ('Opened','Marked Sent')) default 'Opened',
  sent_by uuid references profiles(id) on delete set null,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index whatsapp_messages_sent_at_idx on whatsapp_messages (sent_at desc);
create index whatsapp_messages_context_idx on whatsapp_messages (context_type, context_id);

alter table whatsapp_messages enable row level security;

create policy whatsapp_messages_select on whatsapp_messages for select
  using (
    auth_has_permission('calendar.view')
    or auth_has_permission('orders.view')
    or auth_has_permission('customers.view')
  );

grant select on whatsapp_messages to authenticated, service_role;

create function log_whatsapp_message(
  p_phone text,
  p_message text,
  p_context_type text,
  p_context_id uuid,
  p_status text default 'Opened'
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not (
    auth_has_permission('calendar.view')
    or auth_has_permission('orders.view')
    or auth_has_permission('customers.view')
  ) then
    raise exception 'permission denied: communication access required';
  end if;

  if p_phone is null or length(trim(p_phone)) = 0 then
    raise exception 'phone is required';
  end if;

  if p_message is null or length(trim(p_message)) = 0 then
    raise exception 'message is required';
  end if;

  insert into whatsapp_messages (
    phone, message, context_type, context_id, status, sent_by
  ) values (
    trim(p_phone), trim(p_message), p_context_type, p_context_id, coalesce(p_status, 'Opened'), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function log_whatsapp_message(text, text, text, uuid, text) to authenticated, service_role;
