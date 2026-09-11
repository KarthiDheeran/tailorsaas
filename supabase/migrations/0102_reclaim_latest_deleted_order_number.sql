-- Reuse only the last issued shop order number. Never close older gaps or
-- renumber surviving orders. Counter and deletion commit/roll back together.
create or replace function public.delete_untouched_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
begin
  if not public.auth_has_permission('orders.edit') then
    raise exception 'permission denied: orders.edit required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
    and public.auth_can_access_scope(tenant_id, shop_id, order_section);
  if not found then
    raise exception 'Order not found or access denied.';
  end if;

  -- Creation takes this same counter lock before inserting an order. Keep
  -- that lock order so creation and deletion cannot reuse a number together.
  perform 1 from public.shop_order_number_counters
  where tenant_id = v_order.tenant_id and shop_id = v_order.shop_id
  for update;

  select * into v_order
  from public.orders
  where id = p_order_id
    and public.auth_can_access_scope(tenant_id, shop_id, order_section)
  for update;
  if not found then
    raise exception 'Order not found or access denied.';
  end if;

  -- Block production updates while checking whether the order is untouched.
  -- The order lock also blocks new referencing payment/work rows.
  perform 1 from public.job_cards
  where order_id = p_order_id
  order by id
  for update;

  if exists (select 1 from public.payments where order_id = p_order_id)
     or exists (select 1 from public.order_financial_adjustments where order_id = p_order_id) then
    raise exception 'Orders with payment or financial activity cannot be deleted.';
  end if;

  if exists (
    select 1 from public.job_cards
    where order_id = p_order_id
      and (
        current_stage <> 'Unassigned'
        or assigned_staff_id is not null
        or started_date is not null
        or completed_date is not null
        or cancelled
      )
  ) then
    raise exception 'This order has already started production and cannot be deleted.';
  end if;

  if exists (select 1 from public.job_card_stage_slips where order_id = p_order_id)
     or exists (select 1 from public.staff_work_earnings where order_id = p_order_id) then
    raise exception 'This order has job-card or staff work activity and cannot be deleted.';
  end if;

  delete from public.orders where id = p_order_id;

  update public.shop_order_number_counters
  set last_seq = last_seq - 1, updated_at = now()
  where tenant_id = v_order.tenant_id
    and shop_id = v_order.shop_id
    and last_seq = v_order.order_sequence
    and last_seq > 0
    and not exists (
      select 1 from public.orders
      where tenant_id = v_order.tenant_id
        and shop_id = v_order.shop_id
        and order_sequence >= v_order.order_sequence
    );
end;
$$;

revoke all on function public.delete_untouched_order(uuid) from public;
grant execute on function public.delete_untouched_order(uuid) to authenticated, service_role;
