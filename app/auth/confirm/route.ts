import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles the link Supabase emails for resetPasswordForEmail — follows
// Supabase's documented token_hash/verifyOtp pattern for Next.js Route
// Handlers. Exchanges the link's token for a session, then redirects into
// the actual "set new password" page. The exact link shape (token_hash vs.
// PKCE code) depends on the project's email template/flow — this covers the
// documented default; worth a real end-to-end test once a live project
// exists.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/reset-password";

  if (tokenHash && type) {
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = next;
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
  }

  const errorUrl = request.nextUrl.clone();
  errorUrl.pathname = "/login";
  errorUrl.search = "";
  errorUrl.searchParams.set("error", "reset-link-invalid");
  return NextResponse.redirect(errorUrl);
}
