-- Add a first-class Communications permission.
--
-- Before this, the Communications menu was shown when a role had any of:
-- calendar.view, orders.view, or customers.view. Keep those roles working by
-- adding communications.view once, then let the app gate Communications from
-- this dedicated permission going forward.

update public.roles
set permissions = permissions || array['communications.view']::text[]
where not ('communications.view' = any(permissions))
  and (
    'calendar.view' = any(permissions)
    or 'orders.view' = any(permissions)
    or 'customers.view' = any(permissions)
  );

drop policy if exists whatsapp_messages_select on public.whatsapp_messages;

create policy whatsapp_messages_select on public.whatsapp_messages for select
  using (
    auth_has_permission('communications.view')
    or auth_has_permission('calendar.view')
    or auth_has_permission('orders.view')
    or auth_has_permission('customers.view')
  );

create or replace function public.log_whatsapp_message(
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
    auth_has_permission('communications.view')
    or auth_has_permission('calendar.view')
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

  insert into public.whatsapp_messages (
    phone, message, context_type, context_id, status, sent_by
  ) values (
    trim(p_phone), trim(p_message), p_context_type, p_context_id, coalesce(p_status, 'Opened'), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.log_whatsapp_message(text, text, text, uuid, text) to authenticated, service_role;
