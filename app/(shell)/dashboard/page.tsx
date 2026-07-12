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
  Shirt,
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
  "Revenue Today": IndianRupee,
  "Unassigned Job Cards": ClipboardList,
  "Delayed Job Cards": Scissors,
  "Ready Job Cards": Shirt,
  "Low Stock Items": Package,
  "Customer Fabric": Shirt,
  "Expenses Today": IndianRupee,
} as const;

// Stat cards that surface money figures — hidden for anyone without
// orders.viewPayments (Staff-like access), per the brief's "don't show
// revenue/report money cards" rule.
const MONEY_STAT_LABELS = new Set(["Outstanding Balance", "Revenue Today"]);

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
            New Order
          </Link>
        )}
      </div>

      {loadError && (
        <div className="mb-5">
          <LoadError message={loadError} onRetry={() => window.location.reload()} />
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {visibleStats.map((stat) => (
          <StatCard
            key={stat.label}
            stat={stat}
            icon={STAT_ICONS[stat.label as keyof typeof STAT_ICONS] ?? ShoppingBag}
          />
        ))}
      </div>

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
