"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ShoppingBag,
  Truck,
  AlertTriangle,
  CalendarClock,
  Wallet,
  IndianRupee,
  Plus,
  ClipboardList,
  Scissors,
  Package,
} from "lucide-react";
import { getDashboardDataAction } from "@/app/(shell)/dashboard/actions";
import type { DashboardData } from "@/lib/dashboard";
import { StatCard } from "@/components/dashboard/stat-card";
import { TodaysDeliveries } from "@/components/dashboard/todays-deliveries";
import { OverdueOrdersList } from "@/components/dashboard/overdue-orders-list";
import { TrialQueue } from "@/components/dashboard/trial-queue";
import { PaymentPending } from "@/components/dashboard/payment-pending";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { getErrorMessage, LoadError } from "@/components/ui/load-error";
import { LoadingState } from "@/components/ui/loading-state";

const STAT_ICONS = {
  "Orders Today": ShoppingBag,
  "Deliveries Today": Truck,
  "Overdue Orders": AlertTriangle,
  "Pending Trials": CalendarClock,
  "Outstanding Balance": Wallet,
  "Collected Today": IndianRupee,
  "Unassigned Job Cards": ClipboardList,
  "Delayed Job Cards": Scissors,
  "Low Stock Items": Package,
  "Expenses Today": IndianRupee,
} as const;

// Stat cards that surface money figures — hidden for anyone without
// orders.viewPayments (Staff-like access), per the brief's "don't show
// revenue/report money cards" rule.
const MONEY_STAT_LABELS = new Set(["Outstanding Balance", "Collected Today"]);

const TODAY_STAT_LABELS = [
  "Orders Today",
  "Deliveries Today",
  "Pending Trials",
  "Collected Today",
  "Expenses Today",
];

const ATTENTION_STAT_LABELS = [
  "Overdue Orders",
  "Unassigned Job Cards",
  "Delayed Job Cards",
  "Outstanding Balance",
  "Low Stock Items",
];

const STAT_LINKS: Record<string, string> = {
  "Orders Today": "/orders",
  "Deliveries Today": "/delivery",
  "Pending Trials": "/calendar",
  "Collected Today": "/payments",
  "Expenses Today": "/payments",
  "Outstanding Balance": "/payments?tab=pending-dues",
  "Overdue Orders": "/orders?balance=overdue",
  "Unassigned Job Cards": "/job-cards?filter=Unassigned",
  "Delayed Job Cards": "/job-cards?filter=delayed",
  "Low Stock Items": "/inventory?stock=low",
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
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold text-ink">Dashboard</h1>
          <p className="text-sm text-ink-muted">
            What needs attention today
          </p>
        </div>
        {hasPermission("orders.create") && (
          <Link
            href="/orders/new"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
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
              Orders, collections, delivery, and trial pulse.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
              Work that should be assigned, chased, or replenished.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <TodaysDeliveries orders={data.todaysDeliveries} />
          <OverdueOrdersList orders={data.overdueOrders} />
        </div>
        <div className="space-y-6">
          <TrialQueue orders={data.trialQueue} />
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
