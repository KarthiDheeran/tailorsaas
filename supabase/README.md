# Auth foundation — Phase 1 setup notes

Phase 1 scope only: Supabase project + schema/RLS for `roles`, `staff`, `profiles`. No login UI, no
`CurrentUserProvider` changes, no business-data migration, no mock code removed — see
`C:\Users\DELL\.claude\plans\glowing-gliding-music.md` for the full phased plan.

## 1. Create the Supabase project

1. Create a project at supabase.com (name, region, a strong DB password — the DB password is only needed
   for direct Postgres access, not by the app itself).
2. **Authentication → Settings**: turn **"Allow new user signups" OFF**. There is no public signup page in
   this app — every account is Admin-created (Phase 4), so public signup must stay closed.
3. **Authentication → URL Configuration**: set Site URL and add `http://localhost:3000/reset-password` as a
   redirect URL now (needed once Phase 2 wires up `resetPasswordForEmail`); add the production domain's
   equivalent later, when there is one.
4. **Project Settings → API**: note the Project URL, `anon` public key, and `service_role` secret key —
   these fill the three variables in `.env.example`.

## 2. Environment variables

Copy `.env.example` to `.env.local` (already gitignored via `.env*.local`) and fill in the three values
from step 1.4 above. `SUPABASE_SERVICE_ROLE_KEY` must never be referenced from a `"use client"` file or
sent to the browser — it bypasses RLS entirely. For production, set the same three as secrets in the
Vercel project settings (not committed).

## 3. Apply the migration

`supabase/migrations/0001_auth_foundation.sql` creates `roles`/`staff`/`profiles`, enables RLS, adds the
policies, and seeds the 3 system roles (Admin/Manager/Staff) with today's exact permission sets from
`lib/roles.ts`. Apply it either way — both run the same file:

- **Via Supabase CLI** (if installed and linked to this project): `supabase db push`.
- **Via the dashboard** (no CLI needed): open **SQL Editor**, paste the file's contents, run once.

## 4. Bootstrap the first Admin

This one account is created outside the app (the app that would create it doesn't exist until Phase 4),
with a real password the shop owner will actually use — not a temporary one:

1. **Authentication → Users → Add User** in the dashboard: create the first `auth.users` row with the
   owner's real email + a real password they choose now.
2. In the **SQL Editor**, insert the matching profile (replace the placeholders):

   ```sql
   insert into profiles (id, full_name, phone, role_id, active, must_change_password)
   values (
     '<the auth.users id from step 1, copy from the Users table>',
     '<owner''s name>',
     '<owner''s phone, optional>',
     'role-admin',
     true,
     false  -- this account was created outside the app with a real password, so no forced change
   );
   ```

3. From here on, every other account (Manager/Staff) is created **through the app** by this Admin, once
   Phase 4 ships — with a temporary password and a forced change on first login.

## Not done in this phase

No `npm install`, no app code (`lib/supabase/*`, `middleware.ts`, `/login`, `current-user-provider.tsx`)
changes, and no business-data migration — all deferred to Phases 2+ per the plan.
