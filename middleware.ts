import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Auth-only gate (Phase 2). This checks *whether* a request is logged in,
// not *what* they're allowed to see once inside — that's still
// RequirePermission/AccessDenied, reading from CurrentUserProvider (real
// Supabase-backed roles/permissions as of Phase 3-4, no longer mock).
// Two separate layers, on purpose.
const AUTH_PAGES = ["/login", "/forgot-password", "/reset-password"];

export async function middleware(request: NextRequest) {
  const { response, supabase, user } = await updateSession(request);
  const path = request.nextUrl.pathname;

  // Route Handlers under /auth/** (e.g. /auth/confirm) manage their own
  // session exchange from an emailed link — never gate them here.
  if (path.startsWith("/auth/")) {
    return response;
  }

  if (!user) {
    if (AUTH_PAGES.includes(path)) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Already logged in — don't show the sign-in/forgot-password forms again.
  // (/reset-password is excluded: a just-verified recovery session lands
  // there while already "logged in," and must be allowed through.)
  if (path === "/login" || path === "/forgot-password") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Forced first-login password change, per Phase 2 scope. Skipped on
  // /change-password itself and /reset-password (both are how you satisfy
  // this check in the first place).
  if (path !== "/change-password" && path !== "/reset-password") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", user.id)
      .single();

    if (profile?.must_change_password) {
      const url = request.nextUrl.clone();
      url.pathname = "/change-password";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
