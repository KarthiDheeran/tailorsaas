"use server";

import { requireServerPermission } from "@/lib/auth/require-server-permission";
import { getDashboardData, type DashboardData } from "@/lib/dashboard";
import { withPerformanceContext } from "@/lib/performance/query-profiler";
import { createClient as createServerClient } from "@/lib/supabase/server";

// Dashboard is a derived, read-only summary, but it must use the normal
// cookie-scoped Supabase client. Tenant/shop RLS decides which orders and job
// cards the signed-in user can see, keeping Dashboard consistent with Orders,
// Delivery, Job Cards, and Payments.
export async function getDashboardDataAction(
  todayIso: string,
  filters?: { from?: string; to?: string; stage?: string }
): Promise<DashboardData | null> {
  return withPerformanceContext("getDashboardDataAction", async () => {
    const supabase = createServerClient();
    const guard = await requireServerPermission(supabase, "dashboard.view");
    if (!guard.ok) return null;

    return getDashboardData(supabase, todayIso, filters);
  });
}
