-- Replace test staff with the customer's actual staff and stitching rates.
-- Run AFTER prelive_transaction_cleanup.sql and both garment clone scripts.
-- Login users are preserved, but their old staff links are cleared for relinking.

do $$
declare
  v_confirmation text := 'TYPE REPLACE STAFF HERE';
  v_tenant_id uuid;
  v_mens_shop_id uuid;
  v_womens_shop_id uuid;
begin
  if v_confirmation <> 'REPLACE WITH ACTUAL STAFF' then
    raise exception 'Stopped safely. Set v_confirmation to REPLACE WITH ACTUAL STAFF, then run again.';
  end if;

  if exists (select 1 from public.work_assignments)
     or exists (select 1 from public.job_card_stage_slips where staff_id is not null)
     or exists (select 1 from public.staff_work_earnings)
     or exists (select 1 from public.staff_payments) then
    raise exception 'Run prelive_transaction_cleanup.sql first; staff transaction records still exist.';
  end if;

  select id, tenant_id into v_mens_shop_id, v_tenant_id
  from public.shops where lower(btrim(name)) = 'newlook mens';
  select id into v_womens_shop_id
  from public.shops
  where tenant_id = v_tenant_id and lower(btrim(name)) = 'newlook womens';

  if v_mens_shop_id is null or v_womens_shop_id is null then
    raise exception 'Required shops NewLook Mens and NewLook Womens were not found.';
  end if;

  -- Preserve authentication accounts while removing their obsolete staff link.
  update public.profiles set staff_id = null where staff_id is not null;
  delete from public.shared_desktop_operator_sessions;
  delete from public.staff;
  alter sequence public.staff_number_seq restart with 1;
  alter sequence public.staff_code_seq restart with 1;

  insert into public.staff (
    staff_number, staff_code, tenant_id, shop_id, name, phone, role,
    joining_date, address, emergency_contact, status, notes,
    payment_type, base_salary, piece_rates, garment_stage_rates
  ) values
    ('STAFF-0001',  1, v_tenant_id, v_mens_shop_id,   'VSG',            'TEMP-01', 'Master Tailor',    current_date, '', '', 'Active', 'Temporary contact details', 'Salary',    15000, '{}'::jsonb, '{}'::jsonb),
    ('STAFF-0002',  2, v_tenant_id, v_womens_shop_id, 'PADMAVATHI',     'TEMP-02', 'Master Tailor',    current_date, '', '', 'Active', 'Temporary contact details', 'Salary',    15000, '{}'::jsonb, '{}'::jsonb),
    ('STAFF-0003',  3, v_tenant_id, v_mens_shop_id,   'ANAND',          'TEMP-03', 'Master Tailor',    current_date, '', '', 'Active', 'Temporary contact details', 'Salary',    15000, '{}'::jsonb, '{}'::jsonb),
    ('STAFF-0004',  4, v_tenant_id, v_mens_shop_id,   'SOWNDARYA',      'TEMP-04', 'Master Tailor',    current_date, '', '', 'Active', 'Temporary contact details', 'Salary',    15000, '{}'::jsonb, '{}'::jsonb),
    ('STAFF-0005',  5, v_tenant_id, v_womens_shop_id, 'RAVI-W',         'TEMP-05', 'Stitching Staff', current_date, '', '', 'Active', 'Blouse stitching',          'Per Piece', null, '{}'::jsonb, '{}'::jsonb),
    ('STAFF-0006',  6, v_tenant_id, v_womens_shop_id, 'KARTHI',         'TEMP-06', 'Stitching Staff', current_date, '', '', 'Active', 'Blouse stitching',          'Per Piece', null, '{}'::jsonb, '{}'::jsonb),
    ('STAFF-0007',  7, v_tenant_id, v_womens_shop_id, 'RAMESH',         'TEMP-07', 'Stitching Staff', current_date, '', '', 'Active', 'Blouse stitching',          'Per Piece', null, '{}'::jsonb, '{}'::jsonb),
    ('STAFF-0008',  8, v_tenant_id, v_womens_shop_id, 'PARANJOTHI',     'TEMP-08', 'Stitching Staff', current_date, '', '', 'Active', 'Blouse stitching',          'Per Piece', null, '{}'::jsonb, '{}'::jsonb),
    ('STAFF-0009',  9, v_tenant_id, v_womens_shop_id, 'PRAKASH',        'TEMP-09', 'Stitching Staff', current_date, '', '', 'Active', 'Blouse stitching',          'Per Piece', null, '{}'::jsonb, '{}'::jsonb),
    ('STAFF-0010', 10, v_tenant_id, v_womens_shop_id, 'CHINNAPPAN',      'TEMP-10', 'Stitching Staff', current_date, '', '', 'Active', 'Blouse stitching',          'Per Piece', null, '{}'::jsonb, '{}'::jsonb),
    ('STAFF-0011', 11, v_tenant_id, v_womens_shop_id, 'PRAKASH',        'TEMP-11', 'Stitching Staff', current_date, '', '', 'Active', 'Chudidar stitching',        'Per Piece', null, '{}'::jsonb, '{}'::jsonb),
    ('STAFF-0012', 12, v_tenant_id, v_womens_shop_id, 'TAMIL',          'TEMP-12', 'Stitching Staff', current_date, '', '', 'Active', 'Chudidar stitching',        'Per Piece', null, '{}'::jsonb, '{}'::jsonb),
    ('STAFF-0013', 13, v_tenant_id, v_womens_shop_id, 'CHINNAPPAN',      'TEMP-13', 'Stitching Staff', current_date, '', '', 'Active', 'Chudidar stitching',        'Per Piece', null, '{}'::jsonb, '{}'::jsonb),
    ('STAFF-0014', 14, v_tenant_id, v_womens_shop_id, 'SIVAKUMAR',      'TEMP-14', 'Stitching Staff', current_date, '', '', 'Active', 'Chudidar stitching',        'Per Piece', null, '{}'::jsonb, '{}'::jsonb),
    ('STAFF-0015', 15, v_tenant_id, v_womens_shop_id, 'RAJESH',         'TEMP-15', 'Stitching Staff', current_date, '', '', 'Active', 'Chudidar stitching',        'Per Piece', null, '{}'::jsonb, '{}'::jsonb),
    ('STAFF-0016', 16, v_tenant_id, v_mens_shop_id,   'NARAYANAN',      'TEMP-16', 'Stitching Staff', current_date, '', '', 'Active', 'Pant stitching',            'Per Piece', null, '{}'::jsonb, '{}'::jsonb),
    ('STAFF-0017', 17, v_tenant_id, v_mens_shop_id,   'THIRUMALAISAMY', 'TEMP-17', 'Stitching Staff', current_date, '', '', 'Active', 'Pant stitching',            'Per Piece', null, '{}'::jsonb, '{}'::jsonb),
    ('STAFF-0018', 18, v_tenant_id, v_mens_shop_id,   'JAYASEELAN',     'TEMP-18', 'Stitching Staff', current_date, '', '', 'Active', 'Pant stitching',            'Per Piece', null, '{}'::jsonb, '{}'::jsonb),
    ('STAFF-0019', 19, v_tenant_id, v_mens_shop_id,   'SRINIVASAN',     'TEMP-19', 'Stitching Staff', current_date, '', '', 'Active', 'Pant stitching',            'Per Piece', null, '{}'::jsonb, '{}'::jsonb),
    ('STAFF-0020', 20, v_tenant_id, v_mens_shop_id,   'KARTHI',         'TEMP-20', 'Stitching Staff', current_date, '', '', 'Active', 'Pant stitching',            'Per Piece', null, '{}'::jsonb, '{}'::jsonb),
    ('STAFF-0021', 21, v_tenant_id, v_mens_shop_id,   'RAVI-M',         'TEMP-21', 'Stitching Staff', current_date, '', '', 'Active', 'Shirt stitching',           'Per Piece', null, '{}'::jsonb, '{}'::jsonb),
    ('STAFF-0022', 22, v_tenant_id, v_mens_shop_id,   'SAKTHI',         'TEMP-22', 'Stitching Staff', current_date, '', '', 'Active', 'Shirt stitching',           'Per Piece', null, '{}'::jsonb, '{}'::jsonb),
    ('STAFF-0023', 23, v_tenant_id, v_mens_shop_id,   'ANNACHI',        'TEMP-23', 'Stitching Staff', current_date, '', '', 'Active', 'Shirt stitching',           'Per Piece', null, '{}'::jsonb, '{}'::jsonb),
    ('STAFF-0024', 24, v_tenant_id, v_mens_shop_id,   'SATHIK',         'TEMP-24', 'Stitching Staff', current_date, '', '', 'Active', 'Shirt stitching',           'Per Piece', null, '{}'::jsonb, '{}'::jsonb),
    ('STAFF-0025', 25, v_tenant_id, v_mens_shop_id,   'ANSARAY',        'TEMP-25', 'Stitching Staff', current_date, '', '', 'Active', 'Shirt stitching',           'Per Piece', null, '{}'::jsonb, '{}'::jsonb);

  -- Blouse: one stitching rate applies to every active Blouse garment.
  update public.staff s
  set garment_stage_rates = (
    select coalesce(jsonb_object_agg(g.id::text, jsonb_build_object('Stitching', r.rate)), '{}'::jsonb)
    from public.catalog_garment_types g
    where g.order_section = 'Blouse' and g.is_active
  )
  from (values (5,110), (6,120), (7,110), (8,95), (9,110), (10,110)) r(code, rate)
  where s.staff_code = r.code;

  -- Chudidar: one stitching rate applies to every active Chudidar garment.
  update public.staff s
  set garment_stage_rates = (
    select coalesce(jsonb_object_agg(g.id::text, jsonb_build_object('Stitching', r.rate)), '{}'::jsonb)
    from public.catalog_garment_types g
    where g.order_section = 'Chudidar' and g.is_active
  )
  from (values (11,120), (12,120), (13,120), (14,120), (15,120)) r(code, rate)
  where s.staff_code = r.code;

  -- Pant workers: rate applies only to the Men PANT garment.
  update public.staff s
  set garment_stage_rates = (
    select coalesce(jsonb_object_agg(g.id::text, jsonb_build_object('Stitching', r.rate)), '{}'::jsonb)
    from public.catalog_garment_types g
    where g.order_section = 'Men'
      and lower(btrim(g.name)) = 'pant' and g.is_active
  )
  from (values (16,165), (17,160), (18,155), (19,155), (20,155)) r(code, rate)
  where s.staff_code = r.code;

  -- Shirt workers: exact garment-wise stitching rates supplied by customer.
  update public.staff s
  set garment_stage_rates = rates.rate_json
  from (
    select x.staff_code,
      jsonb_object_agg(g.id::text, jsonb_build_object('Stitching', x.rate)) as rate_json
    from (values
      (21,'half',95), (21,'full',105), (21,'pattu',115), (21,'linen-half',105), (21,'linen-full',115),
      (22,'half',88), (22,'full',100), (22,'pattu',110), (22,'linen-half',100), (22,'linen-full',110),
      (23,'half',95), (23,'full',105),
      (24,'half',86), (24,'full',97),
      (25,'half',85), (25,'full',95)
    ) x(staff_code, garment_key, rate)
    join public.catalog_garment_types g on g.order_section = 'Men' and g.is_active and (
      (x.garment_key = 'half' and lower(btrim(g.name)) in ('h sh','half shirt')) or
      (x.garment_key = 'full' and lower(btrim(g.name)) in ('fsh','full shirt')) or
      (x.garment_key = 'pattu' and lower(btrim(g.name)) = 'pattushirt') or
      (x.garment_key = 'linen-half' and lower(btrim(g.name)) = 'linan hshirt') or
      (x.garment_key = 'linen-full' and lower(btrim(g.name)) = 'linan f shirt')
    )
    group by x.staff_code
  ) rates
  where s.staff_code = rates.staff_code;

  -- Cutting is intentionally absent from all rate JSON, so its cost is zero.
  perform setval('public.staff_number_seq', 25, true);
  perform setval('public.staff_code_seq', 25, true);

  raise notice 'Actual staff import complete: 25 active staff created. Login users remain unlinked for manual relinking.';
end $$;

select s.staff_code, s.name, sh.name as shop, s.payment_type,
  s.base_salary, s.garment_stage_rates
from public.staff s
left join public.shops sh on sh.id = s.shop_id
order by s.staff_code;
