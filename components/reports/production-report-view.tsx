"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ClipboardList, Scissors, Shirt } from "lucide-react";
import Link from "next/link";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { ReportActions } from "@/components/reports/report-actions";
import { ReportSelectShell, reportSelectClassName } from "@/components/reports/report-select";
import { ReportStatCard } from "@/components/reports/report-stat-card";
import { downloadCsv } from "@/lib/csv";
import {
  getProductionReportAction,
  getReportStaffListAction,
} from "@/app/(shell)/reports/actions";
import {
  getDateRangeForPreset,
  type DateRange,
  type DateRangePreset,
  type ProductionReport,
  type ProductionStageFilter,
} from "@/lib/reports";
import { formatDate } from "@/components/orders/orders-table";
import type { JobCardStage } from "@/lib/job-cards";
import type { Staff } from "@/lib/types";
import { useLanguage } from "@/components/i18n/language-provider";
import { cn } from "@/lib/utils";

const EMPTY_REPORT: ProductionReport = {
  summary: { totalActive: 0, unassigned: 0, delayed: 0, ready: 0 },
  rows: [],
};

const STAGE_STYLES: Record<JobCardStage, string> = {
  Unassigned: "bg-warning-soft text-warning",
  Cutting: "bg-chip-blue text-chip-blue-fg",
  Stitching: "bg-chip-blue text-chip-blue-fg",
  Embroidery: "bg-chip-blue text-chip-blue-fg",
  Finishing: "bg-chip-blue text-chip-blue-fg",
  Trial: "bg-chip-info text-chip-info-fg",
  Alteration: "bg-chip-red text-chip-red-fg",
  Delayed: "bg-chip-red text-chip-red-fg",
  Ready: "bg-chip-mint text-chip-mint-fg",
  Delivered: "bg-chip-mint text-chip-mint-fg",
  Cancelled: "bg-chip-info text-chip-info-fg",
};

function StageBadge({ stage }: { stage: JobCardStage }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold",
        STAGE_STYLES[stage]
      )}
    >
      {stage}
    </span>
  );
}

// Production tab — the "delayed job report" item, generalized (per the
// Orders tab's own precedent) into one filterable job-card table covering
// delayed jobs, unassigned work, and stage breakdown, rather than three
// separate tabs. See lib/reports.ts#getProductionReport for why this reads
// job_cards directly rather than a second copy of the delay/stage logic
// already powering /job-cards and /production.
export function ProductionReportView({ todayIso }: { todayIso: string }) {
  const { t } = useLanguage();
  const [preset, setPreset] = useState<DateRangePreset>("all");
  const [customRange, setCustomRange] = useState<DateRange>({
    from: todayIso,
    to: todayIso,
  });
  const [stage, setStage] = useState<ProductionStageFilter>("all");
  const [staffId, setStaffId] = useState("");
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [report, setReport] = useState<ProductionReport | null>(EMPTY_REPORT);

  const range = getDateRangeForPreset(preset, todayIso, customRange);

  useEffect(() => {
    let cancelled = false;
    getReportStaffListAction().then((result) => {
      if (!cancelled) setStaffList(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getProductionReportAction({ range, stage, staffId: staffId || undefined }, todayIso).then(
      (result) => {
        if (!cancelled) setReport(result);
      }
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, stage, staffId, todayIso]);

  function handleExport() {
    if (!report) return;
    downloadCsv(
      `production-report-${todayIso}.csv`,
      ["Job Card", "Customer", "Garment", "Order", "Assigned To", "Stage", "Due Date"],
      report.rows.map((r) => [
        r.jobCardNumber,
        r.customer?.name ?? "Unknown",
        r.garment,
        r.orderNumber,
        r.assignedTo,
        r.stage,
        r.deliveryDate,
      ])
    );
  }

  if (report === null) {
    return (
      <div className="rounded-xl border border-border-soft bg-white p-4 text-sm text-ink-muted shadow-soft">
        {t("reports.jobCardsSetupPending")}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter
            preset={preset}
            custom={customRange}
            onPresetChange={setPreset}
            onCustomChange={setCustomRange}
          />
          <ReportSelectShell className="w-44">
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as ProductionStageFilter)}
              className={reportSelectClassName()}
            >
              <option value="all">{t("reports.allStages")}</option>
              <option value="unassigned">{t("reports.unassigned")}</option>
              <option value="inProgress">{t("reports.inProgress")}</option>
              <option value="delayed">{t("reports.delayedOnly")}</option>
              <option value="ready">{t("reports.ready")}</option>
            </select>
          </ReportSelectShell>
          <ReportSelectShell className="w-44">
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className={reportSelectClassName()}
            >
              <option value="">{t("reports.allStaff")}</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.staffNumber} — {s.name}
                </option>
              ))}
            </select>
          </ReportSelectShell>
        </div>
        <ReportActions onExport={handleExport} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ReportStatCard
          label={t("reports.activeJobCards")}
          value={String(report.summary.totalActive)}
          icon={ClipboardList}
        />
        <ReportStatCard
          label={t("reports.unassigned")}
          value={String(report.summary.unassigned)}
          icon={Scissors}
          tone={report.summary.unassigned > 0 ? "warning" : "default"}
        />
        <ReportStatCard
          label={t("reports.delayedJobs")}
          value={String(report.summary.delayed)}
          icon={AlertTriangle}
          tone={report.summary.delayed > 0 ? "warning" : "default"}
        />
        <ReportStatCard
          label={t("reports.readyJobs")}
          value={String(report.summary.ready)}
          icon={Shirt}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
        <table className="w-full text-left">
          <thead className="text-[13px] font-semibold text-ink-muted">
            <tr className="border-b border-border-soft">
              <th className="whitespace-nowrap px-5 py-3">{t("reports.jobCardNo")}</th>
              <th className="whitespace-nowrap px-5 py-3">{t("common.name")}</th>
              <th className="whitespace-nowrap px-5 py-3">{t("reports.garment")}</th>
              <th className="whitespace-nowrap px-5 py-3">{t("reports.orderNo")}</th>
              <th className="whitespace-nowrap px-5 py-3">{t("reports.assignedTo")}</th>
              <th className="whitespace-nowrap px-5 py-3">{t("reports.stage")}</th>
              <th className="whitespace-nowrap px-5 py-3">{t("reports.dueDate")}</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {report.rows.map((card) => (
              <tr key={card.id} className="border-t border-border-soft hover:bg-surface-muted">
                <td className="whitespace-nowrap px-5 py-3 font-semibold text-primary">
                  {card.jobCardNumber}
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  <div className="font-medium text-ink">{card.customer?.name ?? "Unknown"}</div>
                  <div className="text-xs text-ink-muted">{card.customer?.phone ?? ""}</div>
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-ink">
                  {card.garment}
                  {card.totalUnits > 1 && (
                    <span className="ml-1 text-xs text-ink-muted">
                      #{card.unitNo} of {card.totalUnits}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  <Link
                    href={`/orders?view=${card.orderId}`}
                    className="font-medium text-primary hover:underline print:hidden"
                  >
                    {card.orderNumber}
                  </Link>
                  <span className="hidden print:inline">{card.orderNumber}</span>
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-ink-muted">{card.assignedTo}</td>
                <td className="whitespace-nowrap px-5 py-3">
                  <StageBadge stage={card.stage} />
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  <span className={card.isDelayed ? "font-semibold text-chip-red-fg" : "text-ink-muted"}>
                    {formatDate(card.deliveryDate)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {report.rows.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-border-soft bg-white p-8 text-center text-sm text-ink-muted">
          {t("reports.noJobCardsMatch")}
        </div>
      )}
    </div>
  );
}
