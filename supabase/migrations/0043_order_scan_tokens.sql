create extension if not exists pgcrypto;

alter table public.orders
  add column if not exists scan_token text;

update public.orders
set scan_token = upper(replace(gen_random_uuid()::text, '-', ''))
where scan_token is null;

alter table public.orders
  alter column scan_token set default upper(replace(gen_random_uuid()::text, '-', '')),
  alter column scan_token set not null;

create unique index if not exists orders_scan_token_key
  on public.orders (scan_token);
