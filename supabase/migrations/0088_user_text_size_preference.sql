-- Per-user app text size preference for screen UI.
-- Print layouts continue to use their own fixed CSS and are not affected.

alter table public.profiles
  add column if not exists preferred_text_size text not null default 'default';

alter table public.profiles
  drop constraint if exists profiles_preferred_text_size_check;

alter table public.profiles
  add constraint profiles_preferred_text_size_check
  check (preferred_text_size in ('default', '17', '18', '19', '20'));
