"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, IndianRupee, Package } from "lucide-react";
import { ReportActions } from "@/components/reports/report-actions";
import { ReportStatCard } from "@/components/reports/report-stat-card";
import { downloadCsv } from "@/lib/csv";
import { getInventoryReportAction } from "@/app/(shell)/reports/actions";
import type { InventoryReport } from "@/lib/reports";
import type { InventoryItemType } from "@/lib/types";
import { useLanguage } from "@/components/i18n/language-provider";
import { cn } from "@/lib/utils";

const ITEM_TYPES: InventoryItemType[] = [
  "Fabric",
  "Button",
  "Lining",
  "Thread",
  "Zip",
  "Accessory",
  "Other",
];

function money(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

// Inventory tab — the "low-stock report" item. A point-in-time snapshot
// (no date range — see lib/reports.ts#getInventoryReport). Money columns
// (Cost/Unit, Value, Total Stock Value) are hidden without
// orders.viewPayments, same cross-cutting rule OrdersTable already applies
// to its Total/Balance columns — this tab stays visible to Staff-like
// roles either way, just without the cost figures.
export function InventoryReportView({ canViewPayments }: { canViewPayments: boolean }) {
  const { t } = useLanguage();
  const [itemType, setItemType] = useState<InventoryItemType | "">("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [report, setReport] = useState<InventoryReport | null>({
    summary: { totalActiveItems: 0, lowStockCount: 0, totalStockValue: 0 },
    rows: [],
  });

  useEffect(() => {
    let cancelled = false;
    getInventoryReportAction({
      itemType: itemType || undefined,
      lowStockOnly,
      query,
    }).then((result) => {
      if (!cancelled) setReport(result);
    });
    return () => {
      cancelled = true;
    };
  }, [itemType, lowStockOnly, query]);

  function handleExport() {
    if (!report) return;
    downloadCsv(
      `inventory-report-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Item",
        "Type",
        "On Hand",
        "Unit",
        "Reorder Level",
        "Cost/Unit",
        "Vendor",
        "Purchase Date",
        "Purchase Cost",
        "Value",
        "Low Stock",
      ],
      report.rows.map((r) => [
        r.item.name,
        r.item.itemType,
        r.item.quantityOnHand,
        r.item.unit,
        r.item.reorderLevel,
        r.item.costPerUnit ?? "",
        r.item.vendorName ?? "",
        r.item.purchaseDate ?? "",
        r.item.purchaseCost ?? "",
        r.value,
        r.lowStock ? "Yes" : "No",
      ])
    );
  }

  if (report === null) {
    return (
      <div className="rounded-xl border border-border-soft bg-white p-4 text-sm text-ink-muted shadow-soft">
        {t("reports.inventorySetupPending")}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={itemType}
            onChange={(e) => setItemType(e.target.value as InventoryItemType | "")}
            className="h-9 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint print:hidden"
          >
            <option value="">{t("reports.allItemTypes")}</option>
            {ITEM_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setLowStockOnly((v) => !v)}
            className={cn(
              "h-9 rounded-lg border px-3 text-sm font-medium transition-colors print:hidden",
              lowStockOnly
                ? "border-primary bg-primary-tint text-primary"
                : "border-border bg-white text-ink-muted hover:bg-surface"
            )}
          >
            {t("reports.lowStockOnly")}
          </button>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("reports.searchItem")}
            className="h-9 w-56 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary-tint print:hidden"
          />
        </div>
        <ReportActions onExport={handleExport} />
      </div>

      <div
        className={cn(
          "mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2",
          canViewPayments && "lg:grid-cols-3"
        )}
      >
        <ReportStatCard
          label={t("reports.totalActiveItems")}
          value={String(report.summary.totalActiveItems)}
          icon={Package}
        />
        <ReportStatCard
          label={t("reports.lowStockItems")}
          value={String(report.summary.lowStockCount)}
          icon={AlertTriangle}
          tone={report.summary.lowStockCount > 0 ? "warning" : "default"}
        />
        {canViewPayments && (
          <ReportStatCard
            label={t("reports.totalStockValue")}
            value={money(report.summary.totalStockValue)}
            icon={IndianRupee}
          />
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
        <table className="w-full text-left">
          <thead className="text-[13px] font-semibold text-ink-muted">
            <tr className="border-b border-border-soft">
              <th className="whitespace-nowrap px-5 py-3">{t("reports.itemName")}</th>
              <th className="whitespace-nowrap px-5 py-3">{t("reports.itemType")}</th>
              <th className="whitespace-nowrap px-5 py-3">Vendor</th>
              <th className="whitespace-nowrap px-5 py-3">{t("reports.onHand")}</th>
              <th className="whitespace-nowrap px-5 py-3">{t("reports.reorderLevel")}</th>
              {canViewPayments && (
                <>
                  <th className="whitespace-nowrap px-5 py-3 text-right">
                    {t("reports.costPerUnit")}
                  </th>
                  <th className="whitespace-nowrap px-5 py-3 text-right">
                    {t("reports.stockValue")}
                  </th>
                </>
              )}
              <th className="whitespace-nowrap px-5 py-3">{t("common.status")}</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {report.rows.map((row) => (
              <tr key={row.item.id} className="border-t border-border-soft hover:bg-surface">
                <td className="whitespace-nowrap px-5 py-3">
                  <div className="font-medium text-ink">{row.item.name}</div>
                  {row.item.sku && <div className="text-xs text-ink-muted">{row.item.sku}</div>}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-ink-muted">{row.item.itemType}</td>
                <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                  {row.item.vendorName ?? "—"}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-ink">
                  {row.item.quantityOnHand} {row.item.unit}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                  {row.item.reorderLevel} {row.item.unit}
                </td>
                {canViewPayments && (
                  <>
                    <td className="whitespace-nowrap px-5 py-3 text-right text-ink-muted">
                      {row.item.costPerUnit != null ? money(row.item.costPerUnit) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right text-ink">
                      {money(row.value)}
                    </td>
                  </>
                )}
                <td className="whitespace-nowrap px-5 py-3">
                  {row.lowStock ? (
                    <span className="inline-block rounded-full bg-chip-red px-2.5 py-0.5 text-xs font-semibold text-chip-red-fg">
                      {t("reports.lowStock")}
                    </span>
                  ) : (
                    <span className="inline-block rounded-full bg-chip-mint px-2.5 py-0.5 text-xs font-semibold text-chip-mint-fg">
                      {t("common.active")}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {report.rows.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-border-soft bg-white p-8 text-center text-sm text-ink-muted">
          {t("reports.noInventoryMatch")}
        </div>
      )}
    </div>
  );
}
