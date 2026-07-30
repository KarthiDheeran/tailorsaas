"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ShoppingBag,
  Truck,
  AlertTriangle,
  Wallet,
  IndianRupee,
  Plus,
  ClipboardList,
  Scissors,
} from "lucide-react";
import { getDashboardDataAction } from "@/app/(shell)/dashboard/actions";
import type { DashboardData } from "@/lib/dashboard";
import { StatCard } from "@/components/dashboard/stat-card";
import { TodaysDeliveries } from "@/components/dashboard/todays-deliveries";
import { OverdueOrdersList } from "@/components/dashboard/overdue-orders-list";
import { PaymentPending } from "@/components/dashboard/payment-pending";
import { ProductionQueue } from "@/components/dashboard/production-queue";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { getErrorMessage, LoadError } from "@/components/ui/load-error";
import { LoadingState } from "@/components/ui/loading-state";

const STAT_ICONS = {
  "Orders Today": ShoppingBag,
  "Deliveries Today": Truck,
  "Overdue Orders": AlertTriangle,
  "Outstanding Balance": Wallet,
  "Collected Today": IndianRupee,
  "Unassigned Job Cards": ClipboardList,
  "Delayed Job Cards": Scissors,
  "Expenses Today": IndianRupee,
} as const;

// Stat cards that surface money figures — hidden for anyone without
// orders.viewPayments (Staff-like access), per the brief's "don't show
// revenue/report money cards" rule.
const MONEY_STAT_LABELS = new Set(["Outstanding Balance", "Collected Today"]);

const TODAY_STAT_LABELS = [
  "Orders Today",
  "Deliveries Today",
  "Collected Today",
  "Expenses Today",
];

const ATTENTION_STAT_LABELS = [
  "Overdue Orders",
  "Unassigned Job Cards",
  "Delayed Job Cards",
  "Outstanding Balance",
];

const STAT_LINKS: Record<string, string> = {
  "Orders Today": "/orders",
  "Deliveries Today": "/delivery",
  "Collected Today": "/payments",
  "Expenses Today": "/payments",
  "Outstanding Balance": "/payments?tab=pending-dues",
  "Overdue Orders": "/orders?balance=overdue",
  "Unassigned Job Cards": "/job-cards?filter=Unassigned",
  "Delayed Job Cards": "/job-cards?filter=delayed",
};

function DashboardContent() {
  const { hasPermission } = useCurrentUser();
  const canViewPayments = hasPermission("orders.viewPayments");
  const canViewExpenses = hasPermission("expenses.view");
  // ISO (UTC) date string — consistent between server and client renders,
  // matching the todayIso convention already used in orders-table.tsx.
  const todayIso = new Date().toISOString().slice(0, 10);

  // Phase 6E: fetched via a Server Action now (previously a direct,
  // unguarded lib/dashboard.ts call) — starts null and fills in a moment
  // after mount, same cost already accepted by every other migrated page.
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDashboardDataAction(todayIso)
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
  }, []);

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

  const visibleStats = data.stats.filter((stat) => {
    if (MONEY_STAT_LABELS.has(stat.label)) return canViewPayments;
    if (stat.label === "Expenses Today") return canViewExpenses;
    return true;
  });
  const getStat = (label: string) =>
    visibleStats.find((stat) => stat.label === label);
  const todayStats = TODAY_STAT_LABELS.map(getStat).filter(Boolean) as NonNullable<
    ReturnType<typeof getStat>
  >[];
  const attentionStats = ATTENTION_STAT_LABELS.map(getStat).filter(
    Boolean
  ) as NonNullable<ReturnType<typeof getStat>>[];

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

      <section className="mb-6">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">Today</h2>
            <p className="text-[13px] text-ink-muted">
              Orders, collections, and delivery pulse.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {todayStats.map((stat) => (
            <StatCard
              key={stat.label}
              stat={stat}
              icon={STAT_ICONS[stat.label as keyof typeof STAT_ICONS] ?? ShoppingBag}
              href={STAT_LINKS[stat.label]}
            />
          ))}
        </div>
      </section>

      <section className="mb-6">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">Needs Attention</h2>
            <p className="text-[13px] text-ink-muted">
              Work that should be assigned or chased.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {attentionStats.map((stat) => (
            <StatCard
              key={stat.label}
              stat={stat}
              icon={STAT_ICONS[stat.label as keyof typeof STAT_ICONS] ?? ShoppingBag}
              href={STAT_LINKS[stat.label]}
              emphasized={stat.tone === "warning"}
            />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.85fr)_minmax(320px,1fr)] lg:items-start">
        <div className="space-y-6 lg:col-span-2">
          <TodaysDeliveries orders={data.todaysDeliveries} />
          <OverdueOrdersList orders={data.overdueOrders} />
        </div>
        <div className="space-y-6">
          <ProductionQueue stages={data.productionQueue} />
          {canViewPayments && <PaymentPending orders={data.paymentPending} />}
        </div>
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
