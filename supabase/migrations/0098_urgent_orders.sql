alter table public.orders
  add column if not exists is_urgent boolean not null default false,
  add column if not exists urgent_due_at timestamptz,
  add column if not exists urgent_reason text;

create index if not exists orders_urgent_due_idx
  on public.orders (urgent_due_at)
  where is_urgent = true and status not in ('Delivered', 'Cancelled');

notify pgrst, 'reload schema';
