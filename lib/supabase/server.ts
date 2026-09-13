import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "@/lib/supabase/public-config";
import { createServerClient } from "@supabase/ssr";

// Server Supabase client — used in Server Components and Route Handlers
// (e.g. app/auth/confirm/route.ts). Respects RLS via the anon key; never use
// the service-role key here.
export function createClient() {
  const cookieStore = cookies();
  const { url, key } = getSupabasePublicConfig();

  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a context that can't set cookies (e.g. a Server
            // Component render) — fine as long as middleware is refreshing
            // the session on every request, which it does here.
          }
        },
      },
    }
  );
}
