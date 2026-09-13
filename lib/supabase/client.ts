import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/supabase/public-config";

// Browser Supabase client — used by client components (login, forgot/reset/
// change-password forms, logout button). Respects RLS via the anon key.
export function createClient() {
  const { url, key } = getSupabasePublicConfig();
  return createBrowserClient(
    url,
    key
  );
}
