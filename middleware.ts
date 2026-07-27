import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Auth-only gate (Phase 2). This checks *whether* a request is logged in,
// not *what* they're allowed to see once inside — that's still
// RequirePermission/AccessDenied, reading from CurrentUserProvider (real
// Supabase-backed roles/permissions as of Phase 3-4, no longer mock).
// Two separate layers, on purpose.
const AUTH_PAGES = ["/login", "/forgot-password", "/reset-password"];

export async function middleware(request: NextRequest) {
  const diagnostics = process.env.PERFORMANCE_DIAGNOSTICS === "true";
  const path = request.nextUrl.pathname;
  if (diagnostics) {
    request.headers.set("x-performance-request-id", crypto.randomUUID());
    request.headers.set("x-performance-route", path);
  }
  const startedAt = performance.now();
  const authStartedAt = performance.now();
  const { response, supabase, user } = await updateSession(request);
  const authMs = performance.now() - authStartedAt;

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
  let profileMs = 0;
  if (path !== "/change-password" && path !== "/reset-password") {
    const metadataFlag = user.app_metadata?.must_change_password;
    let mustChangePassword = metadataFlag === true;
    if (metadataFlag !== true && metadataFlag !== false) {
      const profileStartedAt = performance.now();
      const { data: profile } = await supabase
        .from("profiles")
        .select("must_change_password")
        .eq("id", user.id)
        .single();
      profileMs = performance.now() - profileStartedAt;
      mustChangePassword = profile?.must_change_password === true;
    }

    if (mustChangePassword) {
      const url = request.nextUrl.clone();
      url.pathname = "/change-password";
      const redirectResponse = NextResponse.redirect(url);
      if (diagnostics) {
        const totalMs = performance.now() - startedAt;
        redirectResponse.headers.set("Server-Timing", `auth;dur=${authMs.toFixed(1)}, profile;dur=${profileMs.toFixed(1)}, middleware;dur=${totalMs.toFixed(1)}`);
        console.info(`[MIDDLEWARE PERF] path=${path} authMs=${authMs.toFixed(1)} profileMs=${profileMs.toFixed(1)} totalMs=${totalMs.toFixed(1)} redirected=true`);
      }
      return redirectResponse;
    }
  }

  if (diagnostics) {
    const totalMs = performance.now() - startedAt;
    response.headers.set("Server-Timing", `auth;dur=${authMs.toFixed(1)}, profile;dur=${profileMs.toFixed(1)}, middleware;dur=${totalMs.toFixed(1)}`);
    console.info(`[MIDDLEWARE PERF] path=${path} authMs=${authMs.toFixed(1)} profileMs=${profileMs.toFixed(1)} totalMs=${totalMs.toFixed(1)} redirected=false`);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|sw.js|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|map|ico|woff|woff2|ttf|otf)$).*)",
  ],
};
