-- Shared-desktop operator mode is opt-in. Existing shops retain their
-- current authenticated-user workflow until the owner enables it.
create extension if not exists pgcrypto;

alter table public.shop_billing_settings
  add column if not exists require_active_operator boolean not null default false,
  add column if not exists operator_idle_minutes integer not null default 30;

alter table public.shop_billing_settings
  drop constraint if exists shop_billing_settings_operator_idle_minutes_check;
alter table public.shop_billing_settings
  add constraint shop_billing_settings_operator_idle_minutes_check
  check (operator_idle_minutes between 5 and 240);

alter table public.staff
  add column if not exists operator_pin_hash text,
  add column if not exists operator_pin_updated_at timestamptz;

create table if not exists public.shared_desktop_operator_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  staff_id uuid not null references public.staff(id) on delete restrict,
  authenticated_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists shared_desktop_operator_sessions_lookup_idx
  on public.shared_desktop_operator_sessions (token_hash, expires_at);

alter table public.shared_desktop_operator_sessions enable row level security;
revoke all on public.shared_desktop_operator_sessions from authenticated, anon;
-- Server Actions use the service role to maintain the HTTP-only session.
-- This does not grant access to browser users; authenticated and anon remain
-- explicitly denied above.
grant select, insert, update, delete on public.shared_desktop_operator_sessions to service_role;

alter table public.orders
  add column if not exists created_by_operator_id uuid references public.staff(id) on delete set null,
  add column if not exists created_by_operator_name text,
  add column if not exists measurement_taken_by_operator_id uuid references public.staff(id) on delete set null,
  add column if not exists measurement_taken_by_operator_name text,
  add column if not exists delivered_by_operator_id uuid references public.staff(id) on delete set null,
  add column if not exists delivered_by_operator_name text,
  add column if not exists delivered_at timestamptz;

alter table public.payments
  add column if not exists received_by_operator_id uuid references public.staff(id) on delete set null,
  add column if not exists received_by_operator_name text;

-- Make the new columns and table available to Supabase's REST schema cache
-- immediately after the migration is applied.
notify pgrst, 'reload schema';
