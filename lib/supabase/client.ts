import { createBrowserClient } from "@supabase/ssr";

// Browser Supabase client — used by client components (login, forgot/reset/
// change-password forms, logout button). Respects RLS via the anon key.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
