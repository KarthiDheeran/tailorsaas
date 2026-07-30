-- Per-user display theme preference. This is intentionally stored on the
-- profile row, not shop settings, so different users can prefer different
-- contrast levels.
alter table public.profiles
  add column if not exists preferred_theme text not null default 'modern'
  check (preferred_theme in ('modern', 'classic', 'classic-dark'));
