import { createServerClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/supabase/public-config";
import { NextResponse, type NextRequest } from "next/server";

// Cookie-aware Supabase client + session refresh for middleware.ts. Returns
// the (possibly cookie-refreshed) response alongside the client and current
// user so middleware.ts can make routing decisions without a second client.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = getSupabasePublicConfig();

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() (not getSession()) — validates the token against Supabase
  // rather than trusting an unverified cookie value.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, supabase, user };
}
