import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role Supabase client — bypasses RLS entirely and can call the
// Supabase Admin API (create user, set another user's password). The
// `server-only` import makes any accidental import of this file from a
// "use client" component a build-time error, not just a convention to
// remember.
//
// Two intended uses:
// 1. app/(shell)/users-access/actions.ts, for the two operations that
//    genuinely need the Admin API (auth.admin.createUser /
//    auth.admin.updateUserById) — every other read/write there uses the
//    plain cookie-based server client (lib/supabase/server.ts), which
//    already has enough privilege via RLS for a settings.manageUsers caller.
// 2. Phase 6E: app/(shell)/dashboard/actions.ts and app/(shell)/reports/
//    actions.ts, for their internal orders/customers reads, once the
//    caller's dashboard.view/reports.view has already been verified via the
//    normal cookie-based client. Dashboard and Reports are derived,
//    read-only summary views — they intentionally do not require the
//    caller to separately hold orders.view/customers.view just to load,
//    so their own data-fetch step uses this client (bypassing those two
//    tables' RLS) rather than the plain server client. Each action still
//    only returns the specific, shaped Dashboard/Report data the page
//    needs — never a raw, unrestricted Orders/Customers listing.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
