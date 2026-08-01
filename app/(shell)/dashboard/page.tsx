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

const SUMMARY_ROW_LIMIT = 6;
const DEFAULT_SUMMARY_STAGES = [
  "Unassigned",
  "Cutting",
  "Stitching",
  "Finishing",
  "Trial / Alteration",
  "Ready",
  "Delivered",
];

function displayStage(stage: string) {
  if (stage === "Trial" || stage === "Alteration") return "Trial / Alteration";
  return stage;
}

function GarmentProductionSummary({
  rows,
  stages,
  selectedStage,
  selectedGarment,
  from,
  to,
  onFromChange,
  onToChange,
  onStageChange,
  onGarmentChange,
}: {
  rows: DashboardData["garmentSummary"];
  stages: string[];
  selectedStage: string;
  selectedGarment: string;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onStageChange: (value: string) => void;
  onGarmentChange: (value: string) => void;
}) {
  const selectedDisplayStage =
    selectedStage === "all" ? "all" : displayStage(selectedStage);
  const visibleStages =
    selectedDisplayStage === "all"
      ? [
          ...DEFAULT_SUMMARY_STAGES,
          ...Array.from(new Set(rows.map((row) => displayStage(row.stage))))
            .filter((stage) => !DEFAULT_SUMMARY_STAGES.includes(stage))
            .sort(),
        ]
      : [selectedDisplayStage];
  const byGarment = new Map<string, Record<string, number>>();

  for (const row of rows) {
    const stage = displayStage(row.stage);
    const garment = byGarment.get(row.garment) ?? {};
    garment[stage] = (garment[stage] ?? 0) + row.quantity;
    byGarment.set(row.garment, garment);
  }

  const garmentOptions = Array.from(byGarment.keys()).sort((a, b) =>
    a.localeCompare(b)
  );
  const visibleGarmentOptions =
    selectedGarment !== "all" && !garmentOptions.includes(selectedGarment)
      ? [selectedGarment, ...garmentOptions]
      : garmentOptions;
  const matrixRows = Array.from(byGarment.entries())
    .filter(([garment]) => selectedGarment === "all" || garment === selectedGarment)
    .map(([garment, quantities]) => ({
      garment,
      quantities,
      total: Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0),
    }))
    .sort((a, b) => b.total - a.total || a.garment.localeCompare(b.garment));
  const visibleRows = matrixRows.slice(0, SUMMARY_ROW_LIMIT);
  const remainingCount = Math.max(matrixRows.length - visibleRows.length, 0);

  return (
    <section className="overflow-hidden rounded-xl border border-border-soft bg-white shadow-soft">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border-soft px-5 py-4">
        <div>
          <h2 className="text-[17px] font-semibold text-ink">
            Garment Production Summary
          </h2>
          <p className="text-[13px] text-ink-faint">
            Item quantities by current production status
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="text-xs font-semibold text-ink-muted">
            From
            <input
              type="date"
              value={from}
              onChange={(event) => onFromChange(event.target.value)}
              className="mt-1 block h-9 rounded-lg border border-border bg-white px-3 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-ink-muted">
            To
            <input
              type="date"
              min={from}
              value={to}
              onChange={(event) => onToChange(event.target.value)}
              className="mt-1 block h-9 rounded-lg border border-border bg-white px-3 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-ink-muted">
            Garment type
            <select
              value={selectedGarment}
              onChange={(event) => onGarmentChange(event.target.value)}
              className="mt-1 block h-9 min-w-40 rounded-lg border border-border bg-white px-3 text-sm"
            >
              <option value="all">All garments</option>
              {visibleGarmentOptions.map((garment) => (
                <option key={garment} value={garment}>
                  {garment}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-ink-muted">
            Item status
            <select
              value={selectedStage}
              onChange={(event) => onStageChange(event.target.value)}
              className="mt-1 block h-9 min-w-40 rounded-lg border border-border bg-white px-3 text-sm"
            >
              <option value="all">All statuses</option>
              {stages.map((stage) => (
                <option key={stage} value={stage}>
                  {displayStage(stage)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead className="bg-surface-muted/70 font-semibold text-ink-muted">
            <tr className="border-b border-border-soft">
              <th className="whitespace-nowrap px-4 py-2.5">Garment</th>
              {visibleStages.map((stage) => (
                <th key={stage} className="whitespace-nowrap px-3 py-2.5 text-right">
                  {stage}
                </th>
              ))}
              <th className="whitespace-nowrap px-4 py-2.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {visibleRows.map((row) => (
              <tr key={row.garment} className="hover:bg-surface-muted">
                <td className="whitespace-nowrap px-4 py-2.5 font-semibold text-ink">
                  {row.garment}
                </td>
                {visibleStages.map((stage) => (
                  <td key={stage} className="px-3 py-2.5 text-right font-semibold text-ink-muted">
                    {row.quantities[stage] ?? 0}
                  </td>
                ))}
                <td className="px-4 py-2.5 text-right font-bold text-primary">
                  {row.total}
                </td>
              </tr>
            ))}
            {matrixRows.length === 0 && (
              <tr>
                <td
                  colSpan={visibleStages.length + 2}
                  className="px-5 py-7 text-center text-sm text-ink-muted"
                >
                  No garments match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {remainingCount > 0 && (
        <div className="flex items-center justify-between border-t border-border-soft px-5 py-3 text-[13px]">
          <span className="text-ink-muted">{remainingCount} more garment types</span>
          <Link
            href="/reports"
            className="rounded font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            View full report
          </Link>
        </div>
      )}
    </section>
  );
}

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
  const [summaryGarment, setSummaryGarment] = useState("all");

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
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-ink">Dashboard</h1>
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

      <div className="space-y-5">
        <GarmentProductionSummary
          rows={data.garmentSummary}
          stages={data.garmentStages}
          selectedStage={summaryStage}
          selectedGarment={summaryGarment}
          from={summaryFrom}
          to={summaryTo}
          onFromChange={setSummaryFrom}
          onToChange={setSummaryTo}
          onStageChange={setSummaryStage}
          onGarmentChange={setSummaryGarment}
        />

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <TodaysDeliveries orders={data.todaysDeliveries} className="min-h-0 xl:h-full" />
          <ProductionQueue stages={data.productionQueue} className="min-h-0 xl:h-full" />
        </div>

        <div className={canViewPayments ? "grid grid-cols-1 gap-5 xl:grid-cols-5" : ""}>
          <OverdueOrdersList
            orders={data.overdueOrders}
            className={canViewPayments ? "xl:col-span-3" : ""}
          />
          {canViewPayments && (
            <PaymentPending orders={data.paymentPending} className="xl:col-span-2" />
          )}
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
