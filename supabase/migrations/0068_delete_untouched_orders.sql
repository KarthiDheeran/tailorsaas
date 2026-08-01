-- Allow an accidentally-created order to be removed only while it is still
-- completely untouched. The checks and delete share one transaction so a
-- production update cannot race the guard.
create or replace function public.delete_untouched_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.auth_has_permission('orders.edit') then
    raise exception 'permission denied: orders.edit required';
  end if;

  if not exists (
    select 1 from public.orders
    where id = p_order_id
      and tenant_id = public.auth_user_tenant_id()
  ) then
    raise exception 'Order not found.';
  end if;

  if exists (select 1 from public.payments where order_id = p_order_id)
     or exists (select 1 from public.order_financial_adjustments where order_id = p_order_id) then
    raise exception 'Orders with payment or financial activity cannot be deleted.';
  end if;

  if exists (
    select 1
    from public.job_cards
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

  delete from public.orders
  where id = p_order_id
    and tenant_id = public.auth_user_tenant_id();
end;
$$;

revoke all on function public.delete_untouched_order(uuid) from public;
grant execute on function public.delete_untouched_order(uuid) to authenticated, service_role;
