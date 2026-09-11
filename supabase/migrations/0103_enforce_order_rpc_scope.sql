-- Enforce scope before security-definer RPCs read or mutate records.
-- Customer access follows the existing tenant-wide customer master policy.
begin;

create or replace function record_order_financial_adjustment(
  p_order_id uuid,
  p_adjustment_type text,
  p_amount numeric,
  p_adjustment_date date,
  p_payment_mode text,
  p_reason text,
  p_notes text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_adjustment_id uuid;
  v_order_status text;
  v_current_bill_total numeric;
  v_paid_available numeric;
begin
  if not auth_has_permission('orders.recordPayment') then
    raise exception 'permission denied: orders.recordPayment required';
  end if;

  if not public.auth_can_access_order(p_order_id) then
    raise exception 'access denied for order';
  end if;

  if p_adjustment_type not in ('Discount','Extra Charge','Refund') then
    raise exception 'invalid adjustment type: %', p_adjustment_type;
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than zero';
  end if;

  if p_adjustment_date is not null and p_adjustment_date > current_date then
    raise exception 'adjustment date cannot be in the future';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason is required';
  end if;

  if p_adjustment_type = 'Refund' and p_payment_mode is null then
    raise exception 'refund payment mode is required';
  end if;

  if p_adjustment_type <> 'Refund' and p_payment_mode is not null then
    raise exception 'payment mode is only used for refunds';
  end if;

  select status into v_order_status
  from orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'order not found: %', p_order_id;
  end if;

  if v_order_status = 'Cancelled' and p_adjustment_type <> 'Refund' then
    raise exception 'only refunds can be recorded on cancelled orders';
  end if;

  select greatest(
    coalesce((select sum(amount) from order_items where order_id = p_order_id), 0) +
    coalesce((
      select sum(
        case adjustment_type
          when 'Discount' then -amount
          when 'Extra Charge' then amount
          else 0
        end
      )
      from order_financial_adjustments
      where order_id = p_order_id
        and not voided
    ), 0),
    0
  ) into v_current_bill_total;

  if p_adjustment_type = 'Discount' and p_amount > v_current_bill_total then
    raise exception 'discount exceeds current bill total of %', v_current_bill_total;
  end if;

  select coalesce((select sum(amount) from payments where order_id = p_order_id and not voided), 0) -
    coalesce((
      select sum(amount)
      from order_financial_adjustments
      where order_id = p_order_id
        and adjustment_type = 'Refund'
        and not voided
    ), 0)
  into v_paid_available;

  if p_adjustment_type = 'Refund' and p_amount > v_paid_available then
    raise exception 'refund exceeds paid amount available of %', v_paid_available;
  end if;

  insert into order_financial_adjustments (
    order_id,
    adjustment_date,
    adjustment_type,
    amount,
    payment_mode,
    reason,
    notes,
    recorded_by
  ) values (
    p_order_id,
    coalesce(p_adjustment_date, current_date),
    p_adjustment_type,
    p_amount,
    p_payment_mode,
    trim(p_reason),
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid()
  )
  returning id into v_adjustment_id;

  return v_adjustment_id;
end;
$$;

create or replace function void_order_financial_adjustment(
  p_adjustment_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_found uuid;
begin
  if not auth_has_permission('orders.voidPayment') then
    raise exception 'permission denied: orders.voidPayment required';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason is required';
  end if;

  select id into v_found
  from order_financial_adjustments
  where id = p_adjustment_id
    and not voided;
  if not found then
    raise exception 'adjustment not found or already voided: %', p_adjustment_id;
  end if;

  if not public.auth_can_access_order((select order_id from public.order_financial_adjustments where id = p_adjustment_id)) then
    raise exception 'access denied for order';
  end if;

  update order_financial_adjustments set
    voided = true,
    voided_at = now(),
    voided_by = auth.uid(),
    void_reason = trim(p_reason)
  where id = p_adjustment_id;
end;
$$;

create or replace function sync_job_cards_for_order(p_order_id uuid) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order orders%rowtype;
  v_item order_items%rowtype;
  v_unit int;
  v_stage text;
  v_cancelled boolean;
begin
  if not (auth_has_permission('orders.create') or auth_has_permission('orders.edit') or auth_has_permission('staff.manage')) then
    raise exception 'permission denied: cannot sync job cards';
  end if;

  if not public.auth_can_access_order(p_order_id) then
    raise exception 'access denied for order';
  end if;

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'order not found: %', p_order_id;
  end if;

  v_stage := case
    when v_order.status = 'Ready' then 'Ready'
    when v_order.status = 'Delivered' then 'Delivered'
    when v_order.status = 'Cancelled' then 'Cancelled'
    else 'Unassigned'
  end;
  v_cancelled := v_order.status = 'Cancelled';

  for v_item in
    select * from order_items where order_id = p_order_id order by serial_no
  loop
    for v_unit in 1..v_item.qty loop
      insert into job_cards (
        job_card_number, order_id, order_number, customer_id, order_status,
        order_item_serial_no, unit_no, garment_type,
        customer_snapshot, measurements_snapshot, due_date, trial_date,
        fabric_source, fabric_notes, design_notes,
        current_stage, completed_date, cancelled
      ) values (
        generate_job_card_number(), p_order_id, v_order.order_number, v_order.customer_id,
        v_order.status, v_item.serial_no, v_unit, v_item.particular,
        v_order.customer_snapshot, v_item.measurements, v_order.delivery_date, v_order.trial_date,
        v_item.fabric_source, nullif(v_item.fabric_notes, ''), v_item.design_notes,
        v_stage,
        case when v_stage in ('Ready','Delivered') then current_date else null end,
        v_cancelled
      )
      on conflict (order_id, order_item_serial_no, unit_no) do update set
        order_number = excluded.order_number,
        customer_id = excluded.customer_id,
        order_status = excluded.order_status,
        garment_type = excluded.garment_type,
        customer_snapshot = excluded.customer_snapshot,
        measurements_snapshot = excluded.measurements_snapshot,
        due_date = excluded.due_date,
        trial_date = excluded.trial_date,
        fabric_source = excluded.fabric_source,
        fabric_notes = excluded.fabric_notes,
        design_notes = excluded.design_notes,
        current_stage = case
          when excluded.order_status in ('Ready','Delivered','Cancelled')
            then excluded.current_stage
          else job_cards.current_stage
        end,
        completed_date = case
          when excluded.order_status in ('Ready','Delivered')
            then coalesce(job_cards.completed_date, current_date)
          when excluded.order_status = 'Cancelled'
            then job_cards.completed_date
          else job_cards.completed_date
        end,
        cancelled = case
          when excluded.order_status = 'Cancelled' then true
          else job_cards.cancelled
        end,
        updated_at = now();
    end loop;

    update job_cards
    set
      cancelled = true,
      current_stage = 'Cancelled',
      updated_at = now()
    where order_id = p_order_id
      and order_item_serial_no = v_item.serial_no
      and unit_no > v_item.qty
      and completed_date is null;
  end loop;

  update job_cards jc
  set
    cancelled = true,
    current_stage = 'Cancelled',
    updated_at = now()
  where jc.order_id = p_order_id
    and not exists (
      select 1 from order_items oi
      where oi.order_id = jc.order_id
        and oi.serial_no = jc.order_item_serial_no
    )
    and jc.completed_date is null;
end;
$$;

create or replace function public.create_order_with_items(
  p_customer_id uuid, p_customer_snapshot jsonb, p_order_date date,
  p_trial_date date, p_delivery_date date, p_delivery_promise_note text,
  p_advance_paid numeric, p_payment_mode text, p_status text,
  p_order_section text, p_items jsonb
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order_id uuid; v_order_number text; v_invoice_number text;
  v_taxable_total numeric; v_total_amount numeric; v_balance numeric; v_payment_status text;
  v_order_sequence integer; v_tenant_id uuid := public.auth_user_tenant_id(); v_shop_id uuid := public.auth_user_shop_id();
begin
  if not public.auth_has_permission('orders.create') then raise exception 'permission denied: orders.create required'; end if;
  if v_tenant_id is null or v_shop_id is null then raise exception 'user is not assigned to a tenant/shop'; end if;
  if not public.auth_can_access_customer(p_customer_id) then raise exception 'access denied for customer'; end if;
  if p_order_section not in ('Men', 'Chudidar', 'Blouse') then raise exception 'invalid order section'; end if;
  if not public.auth_can_access_scope(v_tenant_id, v_shop_id, p_order_section) then raise exception 'permission denied for order section'; end if;

  select coalesce(sum((item->>'amount')::numeric), 0) into v_taxable_total from jsonb_array_elements(p_items) item;
  v_total_amount := public.order_total_with_configured_tax(v_taxable_total);
  v_balance := v_total_amount - p_advance_paid;
  v_payment_status := case when v_total_amount = 0 then 'Not calculated' when v_balance <= 0 then 'Paid' when p_delivery_date is not null and p_delivery_date < current_date then 'Overdue' else 'Due' end;
  v_order_number := public.generate_order_number(p_order_section);
  v_order_sequence := v_order_number::integer;
  v_invoice_number := public.generate_invoice_number();

  insert into public.orders (tenant_id, shop_id, order_number, order_section, order_sequence, invoice_number, customer_id, customer_snapshot, order_date, trial_date, delivery_date, delivery_promise_note, total_amount, advance_paid, balance, payment_mode, status, payment_status)
  values (v_tenant_id, v_shop_id, v_order_number, p_order_section, v_order_sequence, v_invoice_number, p_customer_id, p_customer_snapshot, p_order_date, p_trial_date, p_delivery_date, coalesce(p_delivery_promise_note, ''), v_total_amount, p_advance_paid, v_balance, p_payment_mode, p_status, v_payment_status)
  returning id into v_order_id;

  insert into public.order_items (order_id, serial_no, particular, garment_type_id, size, qty, rate, add_ons, add_ons_total, final_rate, amount, measurements, field_schema_snapshot, fabric_source, fabric_notes, design_notes, alteration_issue, alteration_required_change, alteration_charge_type, linked_original_order_id)
  select v_order_id, (item->>'serialNo')::int, item->>'particular', nullif(item->>'garmentTypeId','')::uuid, item->>'size', (item->>'qty')::int, (item->>'rate')::numeric, item->'addOns', (item->>'addOnsTotal')::numeric, (item->>'finalRate')::numeric, (item->>'amount')::numeric, item->'measurements', item->'fieldSchemaSnapshot', coalesce(nullif(item->>'fabricSource',''),'Not specified'), coalesce(item->>'fabricNotes',''), coalesce(item->>'designNotes',''), coalesce(item->>'alterationIssue',''), coalesce(item->>'alterationRequiredChange',''), nullif(item->>'alterationChargeType',''), nullif(item->>'linkedOriginalOrderId','')::uuid
  from jsonb_array_elements(p_items) item;

  if p_advance_paid > 0 then insert into public.payments (order_id, amount, payment_date, payment_mode, payment_type, notes, recorded_by) values (v_order_id, p_advance_paid, p_order_date, p_payment_mode, 'Advance', null, auth.uid()); end if;
  return v_order_id;
end;
$$;

commit;
