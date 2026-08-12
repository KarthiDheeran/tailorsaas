-- Ready-for-delivery is a shopkeeper delivery decision, not a production
-- tally decision. Mark every order job card Ready before changing the order
-- status, so older database guards that inspect job card status do not block
-- manual Ready.
create or replace function public.mark_order_ready_with_bin(
  p_order_id uuid,
  p_delivery_bin text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
begin
  if not public.auth_has_permission('orders.edit') then
    raise exception 'permission denied: orders.edit required';
  end if;
  if not public.auth_can_access_order(p_order_id) then
    raise exception 'permission denied for order';
  end if;

  update public.job_cards
     set current_stage = 'Ready',
         order_status = 'Ready',
         assigned_staff_id = null,
         completed_date = current_date,
         updated_at = now()
   where order_id = p_order_id
     and not cancelled;

  update public.orders
     set status = 'Ready',
         delivery_bin = nullif(btrim(coalesce(p_delivery_bin, '')), ''),
         updated_at = now()
   where id = p_order_id
     and status not in ('Cancelled', 'Delivered')
  returning id into v_order_id;

  if v_order_id is null then
    raise exception 'order not found or cannot be marked ready';
  end if;

  return v_order_id;
end;
$$;

grant execute on function public.mark_order_ready_with_bin(uuid, text) to authenticated, service_role;
