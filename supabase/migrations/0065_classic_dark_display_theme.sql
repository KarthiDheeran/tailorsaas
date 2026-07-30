-- Extend existing per-user display theme preference to include Classic Dark.
-- 0064 may already have been applied with only modern/classic allowed.
alter table public.profiles
  drop constraint if exists profiles_preferred_theme_check;

alter table public.profiles
  add constraint profiles_preferred_theme_check
  check (preferred_theme in ('modern', 'classic', 'classic-dark'));
