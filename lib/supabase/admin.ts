import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role Supabase client — bypasses RLS entirely and can call the
// Supabase Admin API (create user, set another user's password). The
// `server-only` import makes any accidental import of this file from a
// "use client" component a build-time error, not just a convention to
// remember. Used only by the Server Actions in
// app/(shell)/users-access/actions.ts, and only for the two operations that
// genuinely need it (auth.admin.createUser / auth.admin.updateUserById) —
// every other read/write in those actions uses the plain cookie-based
// server client (lib/supabase/server.ts), which already has enough
// privilege via RLS for a settings.manageUsers caller.
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
