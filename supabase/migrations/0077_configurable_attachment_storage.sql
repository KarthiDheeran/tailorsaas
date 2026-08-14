alter table public.shop_billing_settings
  add column if not exists attachment_storage_provider text not null default 'supabase',
  add column if not exists attachment_local_root_path text;

alter table public.shop_billing_settings
  drop constraint if exists shop_billing_settings_attachment_storage_provider_check;

alter table public.shop_billing_settings
  add constraint shop_billing_settings_attachment_storage_provider_check
  check (attachment_storage_provider in ('supabase', 'local'));

update public.shop_billing_settings
set attachment_storage_provider = coalesce(attachment_storage_provider, 'supabase')
where attachment_storage_provider is null;

alter table public.order_attachments
  add column if not exists storage_provider text not null default 'supabase';

alter table public.order_attachments
  drop constraint if exists order_attachments_storage_provider_check;

alter table public.order_attachments
  add constraint order_attachments_storage_provider_check
  check (storage_provider in ('supabase', 'local'));

update public.order_attachments
set storage_provider = coalesce(storage_provider, 'supabase')
where storage_provider is null;

grant select, insert, update on public.shop_billing_settings to authenticated, service_role;
grant select, insert, update, delete on public.order_attachments to authenticated, service_role;
