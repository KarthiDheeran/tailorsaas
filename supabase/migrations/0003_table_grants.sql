-- Fixes a gap in 0001: creating roles/staff/profiles via the SQL Editor (as
-- `postgres`) did not extend the usual SELECT/INSERT/UPDATE/DELETE grants to
-- `authenticated`/`service_role` the way Supabase's own migration tooling
-- normally does — discovered when even the service_role key got "permission
-- denied for table X" on all three tables. RLS policies (0001) already gate
-- row-level access; this just grants the base table privileges RLS needs
-- something to filter in the first place. `anon` is deliberately excluded —
-- every policy on these tables requires an authenticated, active profile, so
-- an unauthenticated request can't pass RLS regardless of table grants.
grant select, insert, update, delete on roles, staff, profiles to authenticated, service_role;
