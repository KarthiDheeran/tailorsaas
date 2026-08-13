alter table public.job_card_stage_slips
  add column if not exists delivery_date date;

update public.job_card_stage_slips slips
set delivery_date = orders.delivery_date
from public.orders orders
where slips.order_id = orders.id
  and slips.delivery_date is null;
