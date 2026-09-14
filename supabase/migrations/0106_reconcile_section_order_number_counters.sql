-- Continue each section from its highest existing number. This repairs shops
-- where section counters were initialized before their test orders were
-- classified or imported. Counters only move forward and orders are unchanged.
begin;

lock table public.orders in share row exclusive mode;
lock table public.shop_order_number_counters in access exclusive mode;

with issued_maximums as (
  select tenant_id, shop_id, order_section, order_number_year, max(order_sequence) as last_seq
  from public.orders
  where tenant_id is not null
    and shop_id is not null
    and order_section in ('Men','Chudidar','Blouse')
    and order_sequence is not null
  group by tenant_id, shop_id, order_section, order_number_year
)
update public.shop_order_number_counters counter
set last_seq = greatest(counter.last_seq, issued.last_seq),
    updated_at = now()
from issued_maximums issued
where issued.tenant_id = counter.tenant_id
  and issued.shop_id = counter.shop_id
  and issued.order_section = counter.order_section
  and issued.order_number_year = counter.numbering_year
  and issued.last_seq > counter.last_seq;

with issued_maximums as (
  select tenant_id, shop_id, order_section, order_number_year, max(order_sequence) as last_seq
  from public.orders
  where tenant_id is not null
    and shop_id is not null
    and order_section in ('Men','Chudidar','Blouse')
    and order_sequence is not null
  group by tenant_id, shop_id, order_section, order_number_year
), latest_numbering_year as (
  select distinct on (tenant_id, shop_id, order_section)
    tenant_id, shop_id, order_section, order_number_year, last_seq
  from issued_maximums
  order by tenant_id, shop_id, order_section, order_number_year desc
)
insert into public.shop_order_number_counters (
  tenant_id, shop_id, order_section, numbering_year, last_seq, updated_at
)
select tenant_id, shop_id, order_section, order_number_year, last_seq, now()
from latest_numbering_year
on conflict (tenant_id, shop_id, order_section) do nothing;

commit;
