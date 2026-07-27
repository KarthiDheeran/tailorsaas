"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireServerPermission } from "@/lib/auth/require-server-permission";
import { getDashboardData, type DashboardData } from "@/lib/dashboard";
import { withPerformanceContext } from "@/lib/performance/query-profiler";

// ---------------------------------------------------------------------------
// Phase 6E: Dashboard's first-ever Server Action layer (it previously called
// lib/dashboard.ts directly, client-side, with zero permission check at all).
//
// Dashboard is a derived, read-only summary — intentionally decoupled from
// orders.view, so owner/manager roles can load operational signals without
// needing the raw Orders screen as an extra dependency.
// Once dashboard.view is confirmed via the normal cookie-based client, the
// actual order data is fetched with the admin client (see
// lib/supabase/admin.ts's updated comment) — bypassing orders' RLS — rather
// than requiring the caller to independently hold orders.view. The shape
// returned is still just DashboardData (computed stat cards + a few order
// lists), never a raw/unrestricted orders listing. Customer names/phones
// inside those lists come from each order's own customerSnapshot, so no
// customers-table access happens here at all.
// ---------------------------------------------------------------------------

export async function getDashboardDataAction(
  todayIso: string
): Promise<DashboardData | null> {
  return withPerformanceContext("getDashboardDataAction", async () => {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "dashboard.view");
  if (!guard.ok) return null;

  const admin = createAdminClient();
  return getDashboardData(admin, todayIso);
  });
}
