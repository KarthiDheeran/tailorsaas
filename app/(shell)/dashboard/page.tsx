"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getDashboardDataAction } from "@/app/(shell)/dashboard/actions";
import type { DashboardData } from "@/lib/dashboard";
import { TodaysDeliveries } from "@/components/dashboard/todays-deliveries";
import { OverdueOrdersList } from "@/components/dashboard/overdue-orders-list";
import { PaymentPending } from "@/components/dashboard/payment-pending";
import { ProductionQueue } from "@/components/dashboard/production-queue";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { getErrorMessage, LoadError } from "@/components/ui/load-error";
import { LoadingState } from "@/components/ui/loading-state";

// Stat cards that surface money figures — hidden for anyone without
// orders.viewPayments (Staff-like access), per the brief's "don't show
// revenue/report money cards" rule.
function DashboardContent() {
  const { hasPermission } = useCurrentUser();
  const canViewPayments = hasPermission("orders.viewPayments");
  // ISO (UTC) date string — consistent between server and client renders,
  // matching the todayIso convention already used in orders-table.tsx.
  const todayIso = new Date().toISOString().slice(0, 10);

  // Phase 6E: fetched via a Server Action now (previously a direct,
  // unguarded lib/dashboard.ts call) — starts null and fills in a moment
  // after mount, same cost already accepted by every other migrated page.
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [summaryFrom, setSummaryFrom] = useState(todayIso);
  const [summaryTo, setSummaryTo] = useState(todayIso);
  const [summaryStage, setSummaryStage] = useState("all");

  useEffect(() => {
    let cancelled = false;
    getDashboardDataAction(todayIso, { from: summaryFrom, to: summaryTo, stage: summaryStage })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLoadError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(error, "Failed to load dashboard."));
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryFrom, summaryStage, summaryTo, todayIso]);

  if (loadError && !data) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <LoadError message={loadError} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <LoadingState label="Loading dashboard..." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8 2xl:max-w-[1760px]">
      <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-border-soft bg-white px-5 py-4 shadow-soft sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-ink">Dashboard</h1>
          <p className="mt-0.5 text-sm font-medium text-ink-muted">
            What needs attention today
          </p>
        </div>
        {hasPermission("orders.create") && (
          <Link
            href="/orders/new"
            className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" />
            <span>New Order</span>
            <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[11px] font-semibold">
              Alt N
            </span>
          </Link>
        )}
      </div>

      {loadError && (
        <div className="mb-5">
          <LoadError message={loadError} onRetry={() => window.location.reload()} />
        </div>
      )}

      <section className="mb-6 overflow-hidden rounded-2xl border border-border-soft bg-white shadow-soft">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border-soft p-4 sm:p-5">
          <div><h2 className="text-lg font-bold text-ink">Garment Production Summary</h2><p className="text-sm text-ink-muted">Item quantities created in orders, grouped by current status.</p></div>
          <div className="flex flex-wrap gap-2">
            <label className="text-xs font-semibold text-ink-muted">From<input type="date" value={summaryFrom} onChange={(event) => setSummaryFrom(event.target.value)} className="mt-1 block h-10 rounded-lg border border-border bg-white px-3 text-sm" /></label>
            <label className="text-xs font-semibold text-ink-muted">To<input type="date" min={summaryFrom} value={summaryTo} onChange={(event) => setSummaryTo(event.target.value)} className="mt-1 block h-10 rounded-lg border border-border bg-white px-3 text-sm" /></label>
            <label className="text-xs font-semibold text-ink-muted">Item status<select value={summaryStage} onChange={(event) => setSummaryStage(event.target.value)} className="mt-1 block h-10 min-w-40 rounded-lg border border-border bg-white px-3 text-sm"><option value="all">All statuses</option>{data.garmentStages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select></label>
          </div>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="bg-surface-muted text-xs uppercase text-ink-faint"><tr><th className="px-5 py-3">Garment</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Quantity</th></tr></thead><tbody className="divide-y divide-border-soft">{data.garmentSummary.map((row) => <tr key={`${row.garment}-${row.stage}`}><td className="px-5 py-3 font-semibold text-ink">{row.garment}</td><td className="px-5 py-3 text-ink-muted">{row.stage}</td><td className="px-5 py-3 text-right font-bold text-primary">{row.quantity}</td></tr>)}{data.garmentSummary.length === 0 && <tr><td colSpan={3} className="px-5 py-10 text-center text-ink-muted">No garments match this period and status.</td></tr>}</tbody></table></div>
      </section>

      <div className="space-y-6">
        <TodaysDeliveries orders={data.todaysDeliveries} />
        <ProductionQueue stages={data.productionQueue} />
        <OverdueOrdersList orders={data.overdueOrders} />
        {canViewPayments && <PaymentPending orders={data.paymentPending} />}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequirePermission permission="dashboard.view">
      <DashboardContent />
    </RequirePermission>
  );
}
