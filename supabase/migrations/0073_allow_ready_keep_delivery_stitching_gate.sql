-- Customer requirement:
-- Tally scan is only for staff salary/payroll records. It must not block
-- shopkeeper flows such as marking an order Ready or delivering it to the
-- customer.
--
-- Supabase reported this existing trigger function as the blocker:
--   ensure_order_stitching_complete_before_ready_or_delivery()
--
-- Keep the function name/signature so the existing trigger remains valid, but
-- make it a no-op. Payment collection still happens in delivery actions and
-- quick_collect_and_deliver(), but remaining balance no longer blocks delivery.

create or replace function public.ensure_order_stitching_complete_before_ready_or_delivery()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
begin
  return new;
end;
$$;

create or replace function public.quick_collect_and_deliver(
  p_order_id uuid,
  p_amount numeric default 0,
  p_payment_mode text default 'Cash',
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if not public.auth_has_permission('orders.edit') then
    raise exception 'permission denied: orders.edit required';
  end if;
  if not public.auth_can_access_order(p_order_id) then
    raise exception 'permission denied for order';
  end if;
  if p_amount is not null and p_amount > 0 and not public.auth_has_permission('orders.recordPayment') then
    raise exception 'permission denied: orders.recordPayment required';
  end if;

  select status into v_status
    from public.orders
   where id = p_order_id
   for update;
  if not found then raise exception 'order not found'; end if;
  if v_status = 'Delivered' then raise exception 'order is already delivered'; end if;
  if v_status <> 'Ready' then raise exception 'only Ready orders can be delivered'; end if;

  if coalesce(p_amount, 0) > 0 then
    perform public.record_payment(p_order_id, p_amount, current_date, p_payment_mode, p_notes);
  end if;

  update public.orders set status = 'Delivered', updated_at = now() where id = p_order_id;

  update public.job_cards
     set current_stage = 'Delivered',
         order_status = 'Delivered',
         completed_date = current_date,
         assigned_staff_id = null,
         updated_at = now()
   where order_id = p_order_id
     and not cancelled;

  return p_order_id;
end;
$$;

grant execute on function public.quick_collect_and_deliver(uuid, numeric, text, text) to authenticated, service_role;

-- Backfill already-delivered orders that were delivered while the old RPC only
-- changed orders.status, leaving job_cards.current_stage as Ready.
update public.job_cards jc
   set current_stage = 'Delivered',
       order_status = 'Delivered',
       completed_date = coalesce(jc.completed_date, current_date),
       assigned_staff_id = null,
       updated_at = now()
  from public.orders o
 where o.id = jc.order_id
   and o.status = 'Delivered'
   and not jc.cancelled
   and jc.current_stage <> 'Delivered';
