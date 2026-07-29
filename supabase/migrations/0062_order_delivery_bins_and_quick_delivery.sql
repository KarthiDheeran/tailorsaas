-- One cover is stored for each ready order, so the bin belongs to orders
-- rather than individual garments/job cards.
alter table public.orders
  add column if not exists delivery_bin text;

create index if not exists orders_ready_delivery_bin_idx
  on public.orders (status, delivery_bin)
  where status = 'Ready';

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
  if not auth_has_permission('orders.edit') then
    raise exception 'permission denied: orders.edit required';
  end if;

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
  update public.job_cards
     set current_stage = 'Ready',
         assigned_staff_id = null,
         completed_date = current_date,
         updated_at = now()
   where order_id = p_order_id
     and not cancelled;
  return v_order_id;
end;
$$;

-- Payment and delivery are intentionally one transaction.  record_payment
-- already locks the order and recomputes its balance through the existing
-- ledger trigger, so a delivery cannot be saved with an unpaid balance.
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
  v_balance numeric;
begin
  if not auth_has_permission('orders.edit') then
    raise exception 'permission denied: orders.edit required';
  end if;
  if p_amount is not null and p_amount > 0 and not auth_has_permission('orders.recordPayment') then
    raise exception 'permission denied: orders.recordPayment required';
  end if;

  select status, balance into v_status, v_balance
    from public.orders
   where id = p_order_id
   for update;
  if not found then raise exception 'order not found'; end if;
  if v_status = 'Delivered' then raise exception 'order is already delivered'; end if;
  if v_status <> 'Ready' then raise exception 'only Ready orders can be delivered'; end if;

  if coalesce(p_amount, 0) > 0 then
    perform public.record_payment(p_order_id, p_amount, current_date, p_payment_mode, p_notes);
    select balance into v_balance from public.orders where id = p_order_id;
  end if;
  if coalesce(v_balance, 0) > 0 then
    raise exception 'collect the remaining balance of % before delivery', v_balance;
  end if;

  update public.orders set status = 'Delivered', updated_at = now() where id = p_order_id;
  return p_order_id;
end;
$$;

grant execute on function public.mark_order_ready_with_bin(uuid, text) to authenticated, service_role;
grant execute on function public.quick_collect_and_deliver(uuid, numeric, text, text) to authenticated, service_role;
